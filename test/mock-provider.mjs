// 内置 mock provider：实现 OpenAI 兼容协议与 Anthropic 原生协议的最小子集，
// 用来在没有真实 API key 的情况下测试 BananaCLI 的完整链路。
import http from 'node:http';

const sse = (res, event, data) => {
  res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
};

function lastUserText(body) {
  const messages = body.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string' && message.content.trim()) return message.content;
    if (Array.isArray(message.content)) {
      const text = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(' ');
      if (text.trim()) return text;
    }
  }
  return '';
}

function hasToolResult(body) {
  const raw = JSON.stringify(body.messages ?? []);
  return raw.includes('"role":"tool"') || raw.includes('tool_result');
}

/** 取出最后一条工具结果，方便测试断言“工具真的执行了”。 */
function lastToolResult(body) {
  const messages = body.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'tool' && typeof message.content === 'string') return message.content;
    if (message.role === 'user' && Array.isArray(message.content)) {
      for (const block of [...message.content].reverse()) {
        if (block?.type === 'tool_result') {
          return typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
        }
      }
    }
  }
  return '';
}

/** 用户消息里写 `#toolname:arg` 来指定这一轮该调什么工具 */
export function planCalls(text) {
  const marker = /#(\w+)(?::([^\n]*))?/.exec(text);
  const kind = marker?.[1] ?? 'read';
  const arg = (marker?.[2] ?? '').trim();

  const plans = {
    read: [{ name: 'read_file', args: { path: 'package.json' } }],
    shell: [{ name: 'shell', args: { command: arg || 'echo hello-from-shell' } }],
    write: [{ name: 'write_file', args: { path: 'tmp/smoke.txt', content: 'hello\n' } }],
    unknown: [{ name: 'definitely_not_a_tool', args: {} }],
    outside: [{ name: 'read_file', args: { path: 'C:/Windows/win.ini' } }],
    todo: [
      {
        name: 'todo_write',
        args: {
          todos: [
            { text: '读一下 package.json', status: 'done' },
            { text: '检查 src/index.ts', status: 'in_progress' },
          ],
        },
      },
    ],
    multi: [
      { name: 'write_file', args: { path: 'tmp/smoke-multi.txt', content: 'a\n' } },
      { name: 'shell', args: { command: 'echo second-call' } },
    ],
    plugin: [{ name: 'echo_plugin', args: { text: 'hello' } }],
  };
  return plans[kind] ?? plans.read;
}

const counters = new Map();
function hit(key) {
  const value = counters.get(key) ?? 0;
  counters.set(key, value + 1);
  return value;
}

export function createMockProvider() {
  return http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      body = {};
    }

    const openaiStyle = req.url.includes('/chat/completions');
    const text = lastUserText(body);
    const noTools = !body.tools || body.tools.length === 0;

    // —— 故障注入：限流一次 / 上下文超限一次 ——
    if (text.includes('#flaky') && hit('flaky') === 0) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' });
      res.end(JSON.stringify({ error: { message: 'rate limited (mock)' } }));
      return;
    }
    if (text.includes('#overflow') && hit('overflow') === 0) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: "This model's maximum context length is 8192 tokens, please reduce the length." },
        }),
      );
      return;
    }

    const finishText = (answer) => {
      if (openaiStyle) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        sse(res, null, { choices: [{ index: 0, delta: { content: answer } }] });
        sse(res, null, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        sse(res, null, { usage: { prompt_tokens: 100, completion_tokens: 20 } });
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      sse(res, 'message_start', { type: 'message_start', message: { usage: { input_tokens: 100 } } });
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } });
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } });
      sse(res, 'message_stop', { type: 'message_stop' });
      res.end();
    };

    // —— Anthropic prompt caching 声明检查 ——
    if (!openaiStyle && text.includes('#cache')) {
      const systemCached =
        Array.isArray(body.system) &&
        body.system.some((block) => block?.cache_control?.type === 'ephemeral');
      const toolsCached =
        Array.isArray(body.tools) &&
        body.tools.length > 0 &&
        body.tools[body.tools.length - 1]?.cache_control?.type === 'ephemeral';
      finishText(systemCached && toolsCached ? '缓存标记正确' : '缓存标记缺失');
      return;
    }

    // 压缩摘要请求：不带工具，直接返回纯文本摘要
    if (noTools) {
      finishText('## 目标\n冒烟测试\n## 进展\n已读取 package.json\n## 关键事实\n\n- name=banana-cli\n## 下一步\n- 无');
      return;
    }

    // 多模态：请求里带图片就确认收到
    const rawMessages = JSON.stringify(body.messages ?? []);
    if (rawMessages.includes('image_url') || rawMessages.includes('"type":"image"')) {
      finishText('收到图片');
      return;
    }

    // —— 推理内容（DeepSeek-R1 / Claude thinking）——
    if (text.includes('#reasoning')) {
      const reasoning = '先确认用户想要什么，再决定调用哪个工具。';
      if (openaiStyle) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        sse(res, null, { choices: [{ index: 0, delta: { reasoning_content: reasoning } }] });
        sse(res, null, { choices: [{ index: 0, delta: { content: '推理完成。' } }] });
        sse(res, null, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        sse(res, null, { usage: { prompt_tokens: 100, completion_tokens: 20 } });
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      sse(res, 'message_start', { type: 'message_start', message: { usage: { input_tokens: 100 } } });
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: reasoning } });
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
      sse(res, 'content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } });
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '推理完成。' } });
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 1 });
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } });
      sse(res, 'message_stop', { type: 'message_stop' });
      res.end();
      return;
    }

    if (hasToolResult(body)) {
      const last = lastToolResult(body);
      finishText(`工具已执行完毕（mock）。${last ? `结果: ${last.slice(0, 160)}` : ''}`);
      return;
    }

    const calls = planCalls(text);
    if (openaiStyle) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      calls.forEach((call, index) => {
        sse(res, null, {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: '' } },
                ],
              },
            },
          ],
        });
        sse(res, null, {
          choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: JSON.stringify(call.args) } }] } }],
        });
      });
      sse(res, null, { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse(res, 'message_start', { type: 'message_start', message: { usage: { input_tokens: 100 } } });
    calls.forEach((call, index) => {
      sse(res, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: `toolu_${index}`, name: call.name },
      });
      sse(res, 'content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.args) },
      });
      sse(res, 'content_block_stop', { type: 'content_block_stop', index });
    });
    sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } });
    sse(res, 'message_stop', { type: 'message_stop' });
    res.end();
  });
}

export function listenOnRandomPort(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
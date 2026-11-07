import type { ProviderConfig } from '../config/config.ts';
import { fetchWithRetry, isStreamOptionsUnsupported } from './http.ts';
import { openAIReasoningBody } from './reasoning.ts';
import type {
  GenerateOptions,
  GenerateResult,
  Provider,
  ToolCall,
  ToolSchema,
  UMessage,
  Usage,
} from './types.ts';
import { newMessageId } from './types.ts';

interface StreamRuntime {
  generate: GenerateOptions;
  onRetry?: (info: { attempt: number; reason: string; delayMs: number }) => void;
}

function toFunctionTools(tools: ToolSchema[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function toChatMessages(messages: UMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const text = [message.content, message.attachmentContext].filter(Boolean).join('\n\n');
      if (message.images?.length) {
        const parts: unknown[] = [];
        if (text) parts.push({ type: 'text', text });
        for (const image of message.images) {
          parts.push({ type: 'image_url', image_url: { url: image } });
        }
        out.push({ role: 'user', content: parts });
      } else {
        out.push({ role: 'user', content: text });
      }
      continue;
    }
    if (message.role === 'assistant') {
      const entry: Record<string, unknown> = { role: 'assistant', content: message.content || null };
      // DeepSeek / 部分推理模型要求把 reasoning_content 回传，否则带 tools 的续轮会 400。
      if (message.reasoning) entry['reasoning_content'] = message.reasoning;
      if (message.toolCalls?.length) {
        entry['tool_calls'] = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
        }));
      }
      out.push(entry);
      continue;
    }
    out.push({
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content,
    });
  }
  return out;
}

function parseArguments(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __rawArguments: raw };
  }
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text ? `: ${text.slice(0, 600)}` : '';
}

async function* readSse(response: Response): AsyncGenerator<Record<string, unknown>> {
  const body = response.body;
  if (!body) return;
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf('\n\n');
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (!dataLines || dataLines === '[DONE]') continue;
      try {
        yield JSON.parse(dataLines) as Record<string, unknown>;
      } catch {
        // 忽略无法解析的 SSE 行
      }
    }
  }
}

interface StreamedToolCall {
  id: string;
  name: string;
  args: string;
}

function usageOf(raw: any): Usage {
  const usage: Usage = {};
  if (typeof raw?.prompt_tokens === 'number') usage.inputTokens = raw.prompt_tokens;
  if (typeof raw?.completion_tokens === 'number') usage.outputTokens = raw.completion_tokens;
  return usage;
}

async function streamChat(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  runtime: StreamRuntime,
): Promise<GenerateResult> {
  const { generate } = runtime;
  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: generate.signal,
    },
    { signal: generate.signal, onRetry: generate.onRetry ?? runtime.onRetry },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}${await readErrorBody(response)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const payload = (await response.json()) as any;
    const choice = payload?.choices?.[0]?.message;
    const message: UMessage = { role: 'assistant', content: choice?.content ?? '' };
    const calls: ToolCall[] = (choice?.tool_calls ?? []).map((call: any) => ({
      id: call.id ?? newMessageId(),
      name: call.function?.name ?? 'unknown',
      input: parseArguments(call.function?.arguments ?? ''),
    }));
    if (calls.length) message.toolCalls = calls;
    const reasoning = choice?.reasoning_content ?? choice?.reasoning;
    if (typeof reasoning === 'string' && reasoning) {
      message.reasoning = reasoning;
      generate.onReasoning?.(reasoning);
    }
    if (message.content) generate.onText?.(message.content);
    return { message, usage: usageOf(payload?.usage) };
  }

  let text = '';
  let reasoning = '';
  let finishReason = '';
  const partial = new Map<number, StreamedToolCall>();
  const usage: Usage = {};

  for await (const event of readSse(response)) {
    // 用量块可能单独出现在最后一个 chunk 里（stream_options.include_usage）
    const chunkUsage = usageOf(event['usage']);
    if (chunkUsage.inputTokens !== undefined) usage.inputTokens = chunkUsage.inputTokens;
    if (chunkUsage.outputTokens !== undefined) usage.outputTokens = chunkUsage.outputTokens;
    const error = event['error'] as { message?: string } | undefined;
    if (error?.message) throw new Error(`上游返回错误: ${error.message}`);

    const choices = (event['choices'] ?? []) as any[];
    const choice = choices[0];
    if (!choice) continue;
    if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
    const delta = choice.delta ?? {};

    const reasoningChunk = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoningChunk === 'string' && reasoningChunk) {
      reasoning += reasoningChunk;
      generate.onReasoning?.(reasoningChunk);
    }

    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content;
      generate.onText?.(delta.content);
    }

    for (const call of delta.tool_calls ?? []) {
      const slot = partial.get(call.index) ?? { id: '', name: '', args: '' };
      if (call.id) slot.id = call.id;
      if (call.function?.name) slot.name = call.function.name;
      if (call.function?.arguments) slot.args += call.function.arguments;
      partial.set(call.index, slot);
    }
  }

  const toolCalls: ToolCall[] = [...partial.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id || newMessageId(),
      name: call.name || 'unknown',
      input: parseArguments(call.args),
    }))
    .filter((call) => call.name !== 'unknown' || call.id !== '');

  if (!toolCalls.length && finishReason === 'length' && text) {
    text += '\n[输出达到长度上限，未完成]';
  }

  const message: UMessage = { role: 'assistant', content: text };
  if (toolCalls.length) message.toolCalls = toolCalls;
  if (reasoning) message.reasoning = reasoning;
  return { message, usage };
}

export interface OpenAIProviderOptions {
  name: string;
  config: ProviderConfig;
  apiKey?: string;
}

export function createOpenAIProvider(options: OpenAIProviderOptions): Provider {
  const { name, config, apiKey } = options;

  return {
    name,
    get model() {
      return config.model;
    },
    async generate(generateOptions: GenerateOptions): Promise<GenerateResult> {
      const headers: Record<string, string> = { ...(config.headers ?? {}) };
      if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

      const body: Record<string, unknown> = {
        model: config.model,
        messages: [
          ...(generateOptions.system ? [{ role: 'system', content: generateOptions.system }] : []),
          ...toChatMessages(generateOptions.messages),
        ],
        stream: true,
        stream_options: { include_usage: true },
      };
      if (generateOptions.tools.length) {
        body['tools'] = toFunctionTools(generateOptions.tools);
        body['tool_choice'] = 'auto';
      }
      const temperature = generateOptions.temperature ?? config.temperature;
      const maxTokens = generateOptions.maxTokens ?? config.maxTokens;
      if (typeof temperature === 'number') body['temperature'] = temperature;
      if (typeof maxTokens === 'number') body['max_tokens'] = maxTokens;
      if (generateOptions.reasoning) {
        Object.assign(
          body,
          openAIReasoningBody(name, 'openai', config.model, generateOptions.reasoning),
        );
      }

      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const runtime: StreamRuntime = { generate: generateOptions };

      try {
        return await streamChat(url, headers, body, runtime);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isStreamOptionsUnsupported(message)) throw error;
        const retry: Record<string, unknown> = { ...body };
        delete retry['stream_options'];
        return streamChat(url, headers, retry, runtime);
      }
    },
  };
}
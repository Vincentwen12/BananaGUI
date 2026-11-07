import type { ProviderConfig } from '../config/config.ts';
import { fetchWithRetry } from './http.ts';
import { REASONING_BUDGET, supportsReasoning } from './reasoning.ts';
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

const ANTHROPIC_VERSION = '2023-06-01';

function toAnthropicTools(tools: ToolSchema[], promptCaching: boolean): unknown[] {
  return tools.map((tool, index) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
    ...(promptCaching && index === tools.length - 1
      ? { cache_control: { type: 'ephemeral' } }
      : {}),
  }));
}

function messagesUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  // 允许 baseUrl 写成 https://api.anthropic.com 或 .../v1
  return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: unknown[];
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  if (!match) return null;
  return { mediaType: match[1]!, data: match[2]! };
}

/**
 * Anthropic 要求 user/assistant 严格交替，连续同角色的消息必须合并。
 * 这里把工具结果（role=tool）折进 user 消息，再按角色归并。
 */
export function toAnthropicMessages(messages: UMessage[]): AnthropicMessage[] {
  const blocks: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      blocks.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId ?? '',
            content: message.content,
            ...(message.isError ? { is_error: true } : {}),
          },
        ],
      });
      continue;
    }

    const content: unknown[] = [];
    if (message.role === 'assistant' && message.reasoning && message.reasoningSignature) {
      content.push({
        type: 'thinking',
        thinking: message.reasoning,
        signature: message.reasoningSignature,
      });
    }
    if (message.role === 'user') {
      for (const image of message.images ?? []) {
        const parsed = parseDataUrl(image);
        if (parsed) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
          });
        }
      }
    }
    const text = [message.content, message.attachmentContext].filter(Boolean).join('\n\n');
    if (text) content.push({ type: 'text', text });
    for (const call of message.toolCalls ?? []) {
      content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input ?? {} });
    }
    if (content.length === 0) content.push({ type: 'text', text: '' });
    blocks.push({ role: message.role, content });
  }

  const merged: AnthropicMessage[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.role === block.role) last.content.push(...(block.content as unknown[]));
    else merged.push({ role: block.role, content: [...(block.content as unknown[])] });
  }

  // 首条必须是 user
  while (merged.length && merged[0]!.role !== 'user') merged.shift();
  return merged;
}

async function* readSse(response: Response): AsyncGenerator<Record<string, any>> {
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
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          yield JSON.parse(data) as Record<string, any>;
        } catch {
          // 忽略心跳等非 JSON 行
        }
      }
    }
  }
}

async function streamMessages(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  generate: GenerateOptions,
): Promise<GenerateResult> {
  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: generate.signal,
    },
    { signal: generate.signal, onRetry: generate.onRetry },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 600)}` : ''}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const payload = (await response.json()) as any;
    return fromPayload(payload, generate);
  }

  let text = '';
  let reasoning = '';
  let reasoningSignature = '';
  let stopReason = '';
  const usage: Usage = {};
  const blocks = new Map<number, { id: string; name: string; json: string }>();

  for await (const event of readSse(response)) {
    const type = event.type as string;
    if (type === 'error') {
      throw new Error(`上游返回错误: ${event.error?.message ?? JSON.stringify(event.error).slice(0, 300)}`);
    }
    if (type === 'message_start') {
      const input = event.message?.usage?.input_tokens;
      if (typeof input === 'number') usage.inputTokens = input;
      continue;
    }
    if (type === 'content_block_start') {
      const block = event.content_block;
      if (block?.type === 'tool_use') {
        blocks.set(event.index, { id: block.id ?? newMessageId(), name: block.name ?? 'unknown', json: '' });
      } else if (block?.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
        reasoning += block.thinking;
        generate.onReasoning?.(block.thinking);
      }
      continue;
    }
    if (type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        text += delta.text;
        generate.onText?.(delta.text);
      } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        reasoning += delta.thinking;
        generate.onReasoning?.(delta.thinking);
      } else if (delta?.type === 'signature_delta' && typeof delta.signature === 'string') {
        reasoningSignature += delta.signature;
      } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        const slot = blocks.get(event.index);
        if (slot) slot.json += delta.partial_json;
      }
      continue;
    }
    if (type === 'message_delta') {
      if (typeof event.usage?.output_tokens === 'number') usage.outputTokens = event.usage.output_tokens;
      if (typeof event.delta?.stop_reason === 'string') stopReason = event.delta.stop_reason;
    }
  }

  const toolCalls: ToolCall[] = [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => ({
      id: block.id,
      name: block.name,
      input: safeParse(block.json),
    }));

  const message: UMessage = { role: 'assistant', content: text };
  if (toolCalls.length) message.toolCalls = toolCalls;
  if (reasoning) message.reasoning = reasoning;
  if (reasoningSignature) message.reasoningSignature = reasoningSignature;
  if (stopReason === 'max_tokens' && text) message.content += '\n[输出达到长度上限，未完成]';
  return { message, usage };
}

function safeParse(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function fromPayload(payload: any, generate: GenerateOptions): GenerateResult {
  const content = (payload?.content ?? []) as any[];
  let text = '';
  let reasoning = '';
  let reasoningSignature = '';
  const toolCalls: ToolCall[] = [];
  for (const block of content) {
    if (block?.type === 'text') text += block.text ?? '';
    else if (block?.type === 'thinking') {
      reasoning += block.thinking ?? '';
      if (typeof block.signature === 'string') reasoningSignature += block.signature;
    } else if (block?.type === 'tool_use') {
      toolCalls.push({ id: block.id ?? newMessageId(), name: block.name, input: block.input ?? {} });
    }
  }
  if (reasoning) generate.onReasoning?.(reasoning);
  if (text) generate.onText?.(text);
  const message: UMessage = { role: 'assistant', content: text };
  if (toolCalls.length) message.toolCalls = toolCalls;
  if (reasoning) message.reasoning = reasoning;
  if (reasoningSignature) message.reasoningSignature = reasoningSignature;
  return {
    message,
    usage: {
      inputTokens: payload?.usage?.input_tokens,
      outputTokens: payload?.usage?.output_tokens,
    },
  };
}

export interface AnthropicProviderOptions {
  name: string;
  config: ProviderConfig;
  apiKey?: string;
}

export function createAnthropicProvider(options: AnthropicProviderOptions): Provider {
  const { name, config, apiKey } = options;

  return {
    name,
    get model() {
      return config.model;
    },
    async generate(generateOptions: GenerateOptions): Promise<GenerateResult> {
      const headers: Record<string, string> = {
        'anthropic-version': ANTHROPIC_VERSION,
        ...(config.headers ?? {}),
      };
      if (apiKey) headers['x-api-key'] = apiKey;

      const promptCaching = config.promptCaching !== false;
      const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: generateOptions.maxTokens ?? config.maxTokens ?? 8192,
        messages: toAnthropicMessages(generateOptions.messages),
        stream: true,
      };
      if (generateOptions.system) {
        body['system'] = promptCaching
          ? [{ type: 'text', text: generateOptions.system, cache_control: { type: 'ephemeral' } }]
          : generateOptions.system;
      }
      if (generateOptions.tools.length) {
        body['tools'] = toAnthropicTools(generateOptions.tools, promptCaching);
      }
      const thinking =
        generateOptions.reasoning &&
        supportsReasoning(name, 'anthropic', config.model)
          ? REASONING_BUDGET[generateOptions.reasoning]
          : 0;
      if (thinking > 0) {
        body['thinking'] = { type: 'enabled', budget_tokens: thinking };
        body['max_tokens'] = Math.max(Number(config.maxTokens ?? 8192), thinking + 1024);
      } else {
        const temperature = generateOptions.temperature ?? config.temperature;
        if (typeof temperature === 'number') body['temperature'] = temperature;
      }

      return streamMessages(messagesUrl(config.baseUrl), headers, body, generateOptions);
    },
  };
}
import type { ReasoningLevel } from './reasoning.ts';

export type Role = 'user' | 'assistant' | 'tool';

/** 用户消息附带的文件元信息；正文只在需要时读取，不随历史重复传输。 */
export interface MessageAttachment {
  name: string;
  path: string;
  mime?: string;
  size?: number;
  kind?: 'image' | 'text' | 'pdf' | 'binary';
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** 统一的内部消息格式，所有 provider 都以它为输入输出。 */
export interface UMessage {
  role: Role;
  /** 文本内容；tool 角色下是工具执行结果。 */
  content: string;
  /** assistant 消息里发起的工具调用。 */
  toolCalls?: ToolCall[];
  /** tool 消息对应的 tool_call id。 */
  toolCallId?: string;
  isError?: boolean;
  /** tool 消息对应的工具名，便于展示。 */
  name?: string;
  /** 推理模型返回的思考内容；带工具的续轮需要回传给部分 provider。 */
  reasoning?: string;
  /** Anthropic extended thinking 的签名，回传 thinking block 时必须带上。 */
  reasoningSignature?: string;
  /** 用户消息附带的图片（data URL，例如 data:image/png;base64,...）。 */
  images?: string[];
  /** 用户消息附带的文件；用于历史展示和预览，不直接回传给模型。 */
  attachments?: MessageAttachment[];
  /** 从文本附件抽取的正文；只拼进发给模型的文本，不显示在聊天气泡里。 */
  attachmentContext?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface JsonSchema {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
  additionalProperties?: boolean;
}

export interface GenerateOptions {
  messages: UMessage[];
  system: string;
  tools: ToolSchema[];
  signal?: AbortSignal;
  /** 流式文本回调；不提供则内部仍会流式拉取，但只在结束时返回完整文本。 */
  onText?: (chunk: string) => void;
  /** 推理模型的思考过程回调（DeepSeek-R1 / Claude thinking）。 */
  onReasoning?: (chunk: string) => void;
  /** 网络重试提示（429 / 5xx / 连接失败）。 */
  onRetry?: (info: { attempt: number; reason: string; delayMs: number }) => void;
  /** 本轮的思考强度；不支持的模型会被 provider 忽略。 */
  reasoning?: ReasoningLevel;
  /** 单次调用覆盖 max_tokens（标题生成等辅助请求使用）。 */
  maxTokens?: number;
  /** 单次调用覆盖 temperature。 */
  temperature?: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateResult {
  message: UMessage;
  usage: Usage;
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

export function newMessageId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
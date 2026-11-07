/** 带退避重试的 fetch：429/5xx/网络抖动都重试，AbortSignal 立即生效。 */

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export interface RetryOptions {
  /** 最多重试几次（不含首次请求），默认 3。 */
  retries?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; reason: string; delayMs: number }) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let retryReason: string | null = null;
    try {
      const response = await fetch(url, { ...init, signal: options.signal });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) return response;
      retryReason = `HTTP ${response.status}`;
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw error;
      lastError = error;
      retryReason = error instanceof Error ? error.message : String(error);
      if (attempt === retries) break;
    }

    const delayMs = Math.round(400 * 2 ** attempt + Math.random() * 250);
    options.onRetry?.({ attempt: attempt + 1, reason: retryReason ?? 'unknown', delayMs });
    try {
      await sleep(delayMs, options.signal);
    } catch (error) {
      throw error;
    }
  }

  throw new Error(
    `请求 ${url} 连续失败${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`,
  );
}

/** 上游报上下文超限时用来触发压缩重试。 */
export function isContextOverflowError(message: string): boolean {
  return /context[ _-]?length|context[ _-]?window|maximum context|too many tokens|prompt is too long|input is too long|exceed.{0,20}tokens|reduce the length/i.test(
    message,
  );
}

/** 上游 400 且抱怨 stream_options/include_usage 时，退回不带用量的流式请求。 */
export function isStreamOptionsUnsupported(message: string): boolean {
  return /HTTP 4\d\d/.test(message) && /stream_options|include_usage|stream usage/i.test(message);
}
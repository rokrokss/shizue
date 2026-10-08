// Responses API helpers for ChatGPT plan usage. Pure: shared by the background and its tests.
export class ProviderError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export async function requireOK(response: Response) {
  if (response.ok) return response;
  const body = await response.json().catch(() => ({}));
  const code = body.error?.code || body.error || `http_${response.status}`;
  // Do not forward response bodies: OAuth errors could echo credentials.
  throw new ProviderError(typeof code === 'string' ? code : 'provider_error', `ChatGPT request failed (${response.status}).`);
}

export async function readJSON(response: Response) {
  try { return await response.json(); }
  catch { throw new ProviderError('invalid_provider_response', 'ChatGPT returned an unreadable response.'); }
}

export interface ResponseRequest {
  model: unknown;
  input: unknown;
  instructions?: unknown;
  reasoning?: unknown;
}

export function responseRequestBody({ model, input, instructions, reasoning }: ResponseRequest) {
  if (typeof model !== 'string' || !Array.isArray(input) || (instructions !== undefined && typeof instructions !== 'string')) throw new Error('Invalid ChatGPT request.');
  const effort = (reasoning as { effort?: unknown } | undefined)?.effort;
  if (reasoning !== undefined && (
    !reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning) ||
    typeof effort !== 'string' || !['low', 'none'].includes(effort)
  )) throw new Error('Invalid ChatGPT reasoning effort.');
  // Construct only supported fields; never forward arbitrary options.
  return {
    model, input,
    ...(instructions ? { instructions } : {}),
    ...(reasoning ? { reasoning: { effort: effort as 'low' | 'none' } } : {}),
    store: false, stream: true,
  };
}

export function visibleModels(body: { models?: unknown }) {
  if (!Array.isArray(body.models)) throw new Error('ChatGPT returned an invalid model catalog.');
  return body.models.filter((model) => model.visibility === 'list' && typeof model.slug === 'string')
    .map((model) => ({ id: model.slug as string, label: (model.display_name || model.slug) as string }));
}

export type ResponseEvent =
  | { delta: string }
  | { usage: { input_tokens: number; output_tokens: number; total_tokens: number } };

export async function* responseEvents(body: ReadableStream<Uint8Array> | null): AsyncGenerator<ResponseEvent> {
  if (!body) throw new Error('ChatGPT returned no response stream.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let completed = false;
  const parseEvent = (block: string) => {
    const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return null;
    try { return JSON.parse(data); }
    catch { throw new ProviderError('invalid_stream_event', 'ChatGPT returned an invalid stream event.'); }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      // Normalize CRLF after decoding (including a CR/LF split across chunks).
      pending = pending.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) !== -1) {
        const event = parseEvent(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        if (!event) continue;
        if (event.type === 'response.output_text.delta') yield { delta: event.delta };
        if (event.type === 'response.failed' || event.type === 'error') {
          throw new ProviderError(event.response?.error?.code || event.code || 'response_failed', 'ChatGPT could not complete this response.');
        }
        if (event.type === 'response.incomplete') throw new ProviderError('response_incomplete', 'ChatGPT returned an incomplete response.');
        if (event.type === 'response.completed') {
          completed = true;
          yield { usage: event.response?.usage };
          return;
        }
      }
      if (pending.length > 8 * 1024 * 1024) throw new Error('ChatGPT stream event is too large.');
      if (done) break;
    }
    if (!completed) throw new ProviderError('stream_interrupted', 'ChatGPT stream ended before completion.');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

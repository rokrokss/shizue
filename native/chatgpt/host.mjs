import { homedir } from 'node:os';
import { join } from 'node:path';
import { Vault } from './vault.mjs';
import { ChatGPTAuth } from './auth.mjs';
import { encodeMessage, messageDecoder } from './protocol.mjs';
import { ProviderError, requireOK, responseEvents, responseRequestBody } from './responses.mjs';

const auth = new ChatGPTAuth(new Vault(join(homedir(), '.shizue', 'chatgpt')));
const running = new Map();
const send = (message) => process.stdout.write(encodeMessage(message));

async function handle(message) {
  const { id, operation } = message;
  if (typeof id !== 'string' || id.length > 80) return;
  if (operation === 'cancel') { running.get(id)?.abort(); return; }
  if (running.has(id)) return;
  const controller = new AbortController();
  running.set(id, controller);
  const emit = (event) => send({ id, event });
  try {
    let result;
    switch (operation) {
      case 'status': result = await auth.status(); break;
      case 'signIn': result = await auth.signIn(message.accountId, emit, controller.signal); break;
      case 'signOut': result = await auth.signOut(message.accountId); break;
      case 'responses': {
        const body = responseRequestBody(message);
        const session = await auth.access(message.accountId);
        const models = await auth.catalog(session.clientId);
        if (!models.some((m) => m.id === body.model)) throw new ProviderError('model_unavailable', 'This model is unavailable for the selected ChatGPT account.');
        controller.signal.throwIfAborted();
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600_000)]),
        });
        for await (const event of responseEvents((await requireOK(response)).body)) {
          if (typeof event.delta === 'string') {
            // Keep each native message below Chrome's 1 MiB output limit.
            for (let offset = 0; offset < event.delta.length; offset += 16_000) emit({ delta: event.delta.slice(offset, offset + 16_000) });
          } else emit(event);
        }
        result = { completed: true }; break;
      }
      default: throw new Error('Unknown ChatGPT operation.');
    }
    send({ id, result });
  } catch (error) {
    send({ id, error: { code: controller.signal.aborted ? 'cancelled' : error.code || 'chatgpt_error', message: controller.signal.aborted ? 'ChatGPT request cancelled.' : error.message } });
  } finally { running.delete(id); }
}

const decode = messageDecoder((message) => { void handle(message); });
process.stdin.on('data', (chunk) => {
  try { decode(chunk); }
  catch { process.exitCode = 1; process.stdin.destroy(); }
});
process.stdin.on('end', () => { for (const controller of running.values()) controller.abort(); process.exit(0); });

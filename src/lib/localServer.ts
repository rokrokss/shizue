// Finds local LLM servers and their chat models. Runs in extension pages (settings, onboarding); no
// LangChain, so it is safe outside the background.
import { LocalServerConfig, LocalServerModel } from '@/lib/modelRegistry';

// forbidden: Ollama refused the extension's origin. unauthorized: the server wants an API key.
export type LocalServerErrorCode = 'forbidden' | 'unauthorized' | 'unreachable';

export class LocalServerError extends Error {
  constructor(readonly code: LocalServerErrorCode) {
    super(code);
  }
}

// Default addresses of Ollama, LM Studio and llama.cpp's llama-server.
const DEFAULT_SERVERS = [
  'http://localhost:11434',
  'http://localhost:1234',
  'http://localhost:8080',
];

export const isDefaultServer = (baseUrl: string) => DEFAULT_SERVERS.includes(baseUrl);

const OLLAMA_ORIGIN_RULE_ID = 1;
// The settings re-check a server every few seconds while it has no models; the rule only needs
// writing once per page.
let allowedOllamaOrigin: string | undefined;

// Ollama answers POST requests from extension origins with 403 unless OLLAMA_ORIGINS lists them,
// so the extension's own requests to that server carry the server's origin instead. The rule
// covers that exact origin and only requests this extension sends, so web pages and other local
// apps are untouched. It takes effect only where the manifest grants host access (localhost,
// 127.0.0.1); a remote Ollama still needs OLLAMA_ORIGINS. Dynamic rules persist, so the
// background's later requests are covered too.
const allowOllamaOrigin = async (origin: string) => {
  if (allowedOllamaOrigin === origin) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [OLLAMA_ORIGIN_RULE_ID],
    addRules: [
      {
        id: OLLAMA_ORIGIN_RULE_ID,
        priority: 1,
        condition: { urlFilter: `|${origin}/`, initiatorDomains: [chrome.runtime.id] },
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'Origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: origin,
            },
          ],
        },
      },
    ],
  });
  allowedOllamaOrigin = origin;
};

// Accepts "localhost:11434", "http://localhost:1234/v1/" and the like; returns the server root.
export const normalizeBaseUrl = (input: string): string | undefined => {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
    return `${url.origin}${path}`;
  } catch {
    return undefined;
  }
};

const fetchJson = async (url: string, init?: RequestInit) => {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new LocalServerError('unreachable');
  }
  if (res.status === 401) throw new LocalServerError('unauthorized');
  if (res.status === 403) throw new LocalServerError('forbidden');
  if (!res.ok) throw new LocalServerError('unreachable');
  return res.json();
};

// Chat models only: embedding models have no 'completion' capability.
const listOllamaModels = async (baseUrl: string): Promise<LocalServerModel[]> => {
  await allowOllamaOrigin(new URL(baseUrl).origin);
  const { models = [] } = await fetchJson(`${baseUrl}/api/tags`);
  const details = await Promise.all(
    models.map(async ({ name }: { name: string }) => {
      const show = await fetchJson(`${baseUrl}/api/show`, {
        method: 'POST',
        body: JSON.stringify({ model: name }),
      });
      const capabilities: string[] = show.capabilities ?? [];
      const contextLength = Object.entries(show.model_info ?? {}).find(([key]) =>
        key.endsWith('.context_length')
      )?.[1];
      return capabilities.includes('completion')
        ? {
            id: name,
            supportsImages: capabilities.includes('vision'),
            supportsThinking: capabilities.includes('thinking'),
            contextLength: typeof contextLength === 'number' ? contextLength : undefined,
          }
        : undefined;
    })
  );
  return details.filter((model) => model !== undefined);
};

// LM Studio's own API types each model: 'vlm' takes images, 'embeddings' isn't a chat model.
// Undefined for servers without it.
const listLmStudioModels = async (
  baseUrl: string,
  headers?: HeadersInit
): Promise<LocalServerModel[] | undefined> => {
  const data = await fetch(`${baseUrl}/api/v0/models`, { headers })
    .then((res) => (res.ok ? res.json() : undefined))
    .then((body) => body?.data)
    .catch(() => undefined);
  if (!Array.isArray(data) || !data.every((model) => typeof model.type === 'string')) return;
  return data
    .filter(({ type }) => type === 'llm' || type === 'vlm')
    .map(({ id, type }) => ({ id, supportsImages: type === 'vlm', supportsThinking: false }));
};

// /v1/models says nothing about capabilities, so images stay off unless the server is LM Studio;
// embedding models are skipped by name.
const listOpenAICompatibleModels = async (
  baseUrl: string,
  apiKey?: string
): Promise<{ models: LocalServerModel[]; serverName?: string }> => {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  const { data = [] } = await fetchJson(`${baseUrl}/v1/models`, { headers });
  const lmStudioModels = await listLmStudioModels(baseUrl, headers);
  if (lmStudioModels) return { models: lmStudioModels, serverName: 'LM Studio' };
  return {
    models: data
      .map(({ id }: { id: string }) => id)
      .filter((id: string) => !/embed/i.test(id))
      .map((id: string) => ({ id, supportsImages: false, supportsThinking: false })),
  };
};

// Ollama is told apart by /api/version, which the OpenAI-compatible servers don't have.
export const probeLocalServer = async (
  baseUrl: string,
  apiKey?: string
): Promise<LocalServerConfig> => {
  const isOllama = await fetch(`${baseUrl}/api/version`)
    .then(async (res) => res.ok && typeof (await res.json()).version === 'string')
    .catch(() => false);
  if (isOllama) {
    return {
      kind: 'ollama',
      baseUrl,
      serverName: 'Ollama',
      models: await listOllamaModels(baseUrl),
    };
  }
  return {
    kind: 'openai-compatible',
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(await listOpenAICompatibleModels(baseUrl, apiKey)),
  };
};

// The first default server that answers, preferring one with models.
export const detectLocalServer = async (): Promise<LocalServerConfig | undefined> => {
  const results = await Promise.allSettled(DEFAULT_SERVERS.map((url) => probeLocalServer(url)));
  const found = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  return found.find((server) => server.models.length > 0) ?? found[0];
};

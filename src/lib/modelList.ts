// The cloud model slots, each API key provider's default slots and the ChatGPT model rules, from
// site/models/v1.json. The file is bundled at build and fetched again from shizue.net by the
// background (services/background/modelListSync.ts), so models can change without a release.
// It is data only: every value is checked against what the code already knows how to send.
import bundledJson from '@@/site/models/v1.json';
import type { ApiKeyProvider, CloudModel, ModelProvider, ModelSpec } from '@/lib/modelRegistry';

export interface ModelListEntry extends ModelSpec {
  slot: CloudModel;
}

// A valid file itself, so a saved list can be checked again with parseModelList.
export interface ModelList {
  schema: 1;
  // In picker order.
  models: ModelListEntry[];
  defaults: Record<ApiKeyProvider, { chat: CloudModel; translation: CloudModel }>;
  // Where a saved slot the list dropped moves to.
  successors: Record<CloudModel, CloudModel>;
  chatgpt: {
    // Account models never offered, though the account lists them.
    hidden: string[];
    // Where a saved ChatGPT model id moves to.
    successors: Record<string, string>;
    // Fast-call efforts for account models that no API key slot has.
    fastEffort: Record<string, 'none' | 'low'>;
  };
}

// A fetched file longer than this is rejected unread.
export const MAX_MODEL_LIST_CHARS = 64 * 1024;

// No ':', so slots never look like 'local:' or 'chatgpt:' choices.
const SLOT = /^[a-z0-9][a-z0-9.-]{0,39}$/;
// No '/': Gemini puts the id in the request path.
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const OPENROUTER_ID = /^~?[a-z0-9-]+\/[A-Za-z0-9._:-]+$/;
const PROVIDERS: readonly ModelProvider[] = ['openai-api-key', 'gemini-api-key', 'anthropic-api-key'];
const API_KEY_PROVIDERS: readonly ApiKeyProvider[] = [...PROVIDERS, 'openrouter-api-key'];

function check(ok: unknown): asserts ok {
  if (!ok) throw new Error('Invalid model list');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  values.includes(value as T);

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const isSlot = (value: unknown): value is string => typeof value === 'string' && SLOT.test(value);

const isFastEffort = (value: unknown): value is 'none' | 'low' => oneOf(['none', 'low'], value);

function readMap<T>(raw: unknown, isKey: (key: string) => boolean, isValue: (value: unknown) => value is T) {
  check(raw === undefined || isRecord(raw));
  const entries = Object.entries(raw ?? {});
  check(entries.length <= 200 && entries.every(([key, value]) => isKey(key) && isValue(value)));
  return Object.fromEntries(entries) as Record<string, T>;
}

// Builds a fresh entry from the known fields only, so nothing else in the file reaches the code.
function readModel(raw: unknown): ModelListEntry {
  check(isRecord(raw) && isRecord(raw.openrouter));
  const { slot, id, label, provider, supportsTemperature, supportsImages, openaiFastEffort } = raw;
  const { id: openrouterId, fastEffort, defaultEffort } = raw.openrouter;
  check(isSlot(slot) && isId(id));
  check(typeof label === 'string' && label.length > 0 && label.length <= 40 && !/[\u0000-\u001f\u007f]/.test(label));
  check(provider === undefined || oneOf(PROVIDERS, provider));
  check(typeof supportsTemperature === 'boolean' && typeof supportsImages === 'boolean');
  check(openaiFastEffort === undefined || (provider === 'openai-api-key' && isFastEffort(openaiFastEffort)));
  check(typeof openrouterId === 'string' && OPENROUTER_ID.test(openrouterId));
  check(fastEffort === undefined || oneOf(['none', 'minimal', 'low', 'off'], fastEffort));
  check(defaultEffort === undefined || defaultEffort === 'high');
  return {
    slot,
    id,
    label,
    ...(provider ? { provider } : {}),
    supportsTemperature,
    supportsImages,
    ...(openaiFastEffort ? { openaiFastEffort } : {}),
    openrouter: {
      id: openrouterId,
      ...(fastEffort ? { fastEffort } : {}),
      ...(defaultEffort ? { defaultEffort } : {}),
    },
  };
}

// Undefined when any value is missing, unknown or out of range: a bad file is rejected whole.
// Unknown fields are dropped, so a later optional field doesn't stop older versions.
export function parseModelList(raw: unknown): ModelList | undefined {
  try {
    check(isRecord(raw) && raw.schema === 1);
    check(Array.isArray(raw.models) && raw.models.length > 0 && raw.models.length <= 50);
    const models = raw.models.map(readModel);
    const has = (slot: unknown) => models.some((model) => model.slot === slot);
    check(new Set(models.map(({ slot }) => slot)).size === models.length);

    check(isRecord(raw.defaults));
    const defaults = {} as ModelList['defaults'];
    for (const provider of API_KEY_PROVIDERS) {
      const pair = raw.defaults[provider];
      check(isRecord(pair) && isSlot(pair.chat) && isSlot(pair.translation));
      // Each default must run on that provider's key; OpenRouter runs every slot.
      for (const slot of [pair.chat, pair.translation]) {
        const model = models.find((entry) => entry.slot === slot);
        check(model && (provider === 'openrouter-api-key' || model.provider === provider));
      }
      defaults[provider] = { chat: pair.chat, translation: pair.translation };
    }

    const successors = readMap(raw.successors, (slot) => SLOT.test(slot) && !has(slot), isSlot);
    check(Object.values(successors).every(has));

    check(raw.chatgpt === undefined || isRecord(raw.chatgpt));
    const chatGPTRules: Record<string, unknown> = raw.chatgpt ?? {};
    const { hidden = [], successors: chatGPTSuccessors, fastEffort } = chatGPTRules;
    check(Array.isArray(hidden) && hidden.length <= 200 && hidden.every(isId));
    const chatgpt = {
      hidden: [...hidden],
      successors: readMap(chatGPTSuccessors, (id) => ID.test(id), isId),
      fastEffort: readMap(fastEffort, (id) => ID.test(id), isFastEffort),
    };
    check(Object.values(chatgpt.successors).every((id) => !hidden.includes(id)));

    return { schema: 1, models, defaults, successors, chatgpt };
  } catch {
    return undefined;
  }
}

export const bundledModelList: ModelList =
  parseModelList(bundledJson) ??
  (() => {
    throw new Error('site/models/v1.json fails parseModelList');
  })();

// Each context starts from the bundled list; modelListStorage.ts swaps in the saved one.
let current = bundledModelList;
const listeners = new Set<() => void>();

export const getModelList = () => current;

export const setModelList = (list: ModelList) => {
  current = list;
  listeners.forEach((listener) => listener());
};

export const onModelListChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

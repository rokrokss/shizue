export interface WebSource {
  url: string;
  title: string;
}

// Sources shown under an answer: the cited ones first, then other search results.
const MAX_SOURCES = 8;

// Each provider streams search results and citations in its own shape: OpenAI annotations and
// OpenRouter's url_citation ({url, title}), Anthropic search results and text citations ({url,
// title}), Gemini grounding chunks ({web: {uri, title}}). Rather than parse each, this takes every
// object with a web address from a streamed chunk, marking those a citation points at.
const CITATION_TYPES = ['url_citation', 'citation', 'web_search_result_location'];

export const collectWebSources = (
  value: unknown,
  into: Map<string, WebSource & { cited: boolean }>,
  cited = false,
  depth = 0
) => {
  if (depth > 8 || typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectWebSources(item, into, cited, depth + 1));
    return;
  }
  const record = value as Record<string, unknown>;
  const isCitation =
    cited || (typeof record.type === 'string' && CITATION_TYPES.includes(record.type));
  const url = typeof record.url === 'string' ? record.url : record.uri;
  if (typeof url === 'string' && /^https?:\/\//.test(url) && URL.canParse(url)) {
    const title =
      typeof record.title === 'string' && record.title.trim() ? record.title.trim() : new URL(url).host;
    const known = into.get(url);
    if (!known || (isCitation && !known.cited)) into.set(url, { url, title, cited: isCitation });
  }
  for (const [key, child] of Object.entries(record)) {
    collectWebSources(child, into, isCitation || key === 'url_citation' || key === 'citations', depth + 1);
  }
};

export const orderedWebSources = (found: Map<string, WebSource & { cited: boolean }>) =>
  [...found.values()]
    .sort((a, b) => Number(b.cited) - Number(a.cited))
    .slice(0, MAX_SOURCES)
    .map(({ url, title }) => ({ url, title }));

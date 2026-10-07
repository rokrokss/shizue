// Renders the site/index.html template once per site/locales/<lang>.json into _site/:
// English at /, every other language at /<lang>/. Run from the repo root by site/build.sh.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const ORIGIN = 'https://shizue.net';
const STORE_URL = 'https://chromewebstore.google.com/detail/mpcbgfkoholfgapcgcmfjobnfcbnfanm?utm_source=shizue.net';
const RTL = ['ar', 'fa', 'ur'];

const template = readFileSync('site/index.html', 'utf8');
const locales = readdirSync('site/locales')
  .map((file) => {
    const lang = file.replace(/\.json$/, '');
    const strings = JSON.parse(readFileSync(`site/locales/${file}`, 'utf8'));
    return { lang, path: lang === 'en' ? '/' : `/${lang}/`, strings };
  })
  .sort((a, b) => a.lang.localeCompare(b.lang));
const en = locales.find((l) => l.lang === 'en').strings;

// Strings are HTML fragments; a translation must keep the tags of en.json (links, the h1 highlight).
const tags = (html) => (html.match(/<[^>]+>/g) ?? []).join('');
for (const { lang, strings } of locales) {
  for (const key of Object.keys(en)) {
    if (typeof strings[key] !== 'string') throw new Error(`site/locales/${lang}.json: missing "${key}"`);
    if (tags(strings[key]) !== tags(en[key])) throw new Error(`site/locales/${lang}.json: "${key}" changes the tags of en.json`);
  }
}

const alternates = [
  ...locales.map(({ lang, path }) => `<link rel="alternate" hreflang="${lang}" href="${ORIGIN}${path}">`),
  `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`,
].join('\n');

for (const { lang, path, strings } of locales) {
  const menu = locales
    .map((l) => {
      const current = l.lang === lang ? ' aria-current="page"' : '';
      return `<li><a href="${l.path}" hreflang="${l.lang}" lang="${l.lang}"${current}>${l.strings.language}</a></li>`;
    })
    .join('\n          ');
  const vars = {
    // A quote outside a tag is text, and some text lands in attributes (alt, meta content).
    ...Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value.replace(/"(?![^<]*>)/g, '&quot;')])),
    lang,
    dir: RTL.includes(lang) ? 'rtl' : 'ltr',
    code: lang.toUpperCase(),
    home: path,
    url: ORIGIN + path,
    alternates,
    lang_menu: menu,
    // The store listing has a description in each of these languages.
    store_url: lang === 'en' ? STORE_URL : `${STORE_URL}&amp;hl=${lang}`,
  };
  const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`site/index.html: unknown placeholder {{${key}}}`);
    return vars[key];
  });
  mkdirSync(`_site${path}`, { recursive: true });
  writeFileSync(`_site${path}index.html`, html);
}

// Page translation's own rules for sites whose menus, tabs, buttons and dates would otherwise be
// translated along with the content, measured on each site's pages (2026-11). There is no UI.

// Left out on every site, as a rule's exclude is: menus, tabs, toolbars, buttons, dates,
// breadcrumbs and tables of contents (MDN's and Docusaurus's aren't in a <nav>). A button in a
// heading is an accordion's question, which is content.
export const UI_SELECTOR = [
  'nav',
  '[role="navigation"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="toolbar"]',
  '[role="tablist"]',
  'button:not(:is(h1, h2, h3, h4, h5, h6) button)',
  'time',
  '[typeof="BreadcrumbList"]',
  '[itemtype$="BreadcrumbList"]',
  '.breadcrumb',
  '.breadcrumbs',
  '.table-of-contents',
].join(', ');

export type SiteRule = {
  // When the page has any of these, only they are translated. Pages without them (a site's
  // marketing pages) are translated whole.
  content?: string;
  // Never translated, like code: inside a translated paragraph each one stays as it is.
  exclude?: string;
  // Each translated whole, though paragraphs sit inside it.
  units?: string;
};

// A rule is for its hosts and their subdomains, or for pages with its `page` element: sites that
// also run on their owners' domains.
const RULES: { hosts?: string[]; page?: string; rule: SiteRule }[] = [
  {
    hosts: ['wikipedia.org'],
    // The search box, the language and tools buttons, [edit] links.
    rule: { exclude: '#p-search, .vector-dropdown, .mw-editsection' },
  },
  {
    hosts: ['github.com'],
    // READMEs, issue and comment bodies, issue and pull request titles, the repository's About text.
    rule: { content: '.markdown-body, .markdown-title, [class^="description__"]' },
  },
  {
    hosts: ['stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'mathoverflow.net'],
    // The question's title, posts and comments; not tags, menus, user cards or the sidebar.
    rule: { content: '#question-header h1, .s-prose, .comment-copy' },
  },
  {
    hosts: ['reddit.com'],
    // The post's title and text, and comments; not usernames, counts, ads or the related posts.
    rule: { content: 'shreddit-post [slot="title"], [slot="text-body"], [slot="comment"]' },
  },
  {
    hosts: ['news.ycombinator.com'],
    // A comment's first paragraph is bare text before its <p>s, so a comment is translated whole.
    rule: { exclude: '.pagetop, .subline, .comhead, .reply, form, .yclinks', units: '.commtext, .toptext' },
  },
  {
    hosts: ['x.com', 'twitter.com'],
    // Posts and bios. Logged out, X has neither, and its sign-in panel is left out.
    rule: { content: '[data-testid="tweetText"], [data-testid="UserDescription"]', exclude: 'aside' },
  },
  {
    hosts: ['youtube.com'],
    // The video's title and description, comments, and other videos' titles; not the player (its
    // captions are YouTube's), channel names, counts or dates.
    rule: {
      content:
        'ytd-watch-metadata h1, ytd-text-inline-expander yt-attributed-string, #content-text, #video-title, .ytLockupMetadataViewModelTitle',
    },
  },
  {
    hosts: ['linkedin.com'],
    // Posts and comments, logged out; not author cards, follower counts or actions.
    rule: { content: '.attributed-text-segment-list__content' },
  },
  {
    hosts: ['dev.to'],
    // The article's title and body, and comments; not the author card, header or reactions.
    rule: { content: '#main-title h1, #article-body, .comment__body' },
  },
  {
    // Medium, on medium.com or a publication's own domain: what it marks as the post's paragraphs,
    // headings and captions; not claps, the author line or the subscribe box.
    page: 'meta[property="al:android:package"][content="com.medium.reader"]',
    rule: { content: '[data-selectable-paragraph]' },
  },
  {
    // Substack, on a publication's own domain or substack.com: the publication's name and its
    // section tabs (links shaped as buttons).
    page: 'link[href^="https://substackcdn.com/"]',
    rule: { exclude: '.main-menu' },
  },
];

// The rule for this page, on this host.
export const siteRule = (hostname: string): SiteRule | null =>
  RULES.find(
    ({ hosts, page }) =>
      hosts?.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ||
      (page !== undefined && document.querySelector(page) !== null)
  )?.rule ?? null;

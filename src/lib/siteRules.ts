// Page translation's own rules for sites whose menus, tabs, buttons and dates would otherwise be
// translated along with the content, measured on each site's pages (2026-11). There is no UI.
export type SiteRule = {
  // When the page has any of these, only they are translated. Pages without them (a site's
  // marketing pages) are translated whole.
  content?: string;
  // Never translated, like code: inside a translated paragraph each one stays as it is.
  exclude?: string;
  // Each translated whole, though paragraphs sit inside it.
  units?: string;
};

const RULES: { hosts: string[]; rule: SiteRule }[] = [
  {
    hosts: ['wikipedia.org'],
    // Menus, the contents sidebar, page tabs, the search box, the language and tools buttons.
    rule: { exclude: 'nav, #p-search, .vector-dropdown, .mw-editsection' },
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
    // "14일 전" under a post's community, and text only screen readers see.
    rule: { exclude: 'time, faceplate-screen-reader-content' },
  },
  {
    hosts: ['news.ycombinator.com'],
    // A comment's first paragraph is bare text before its <p>s, so a comment is translated whole.
    rule: { exclude: '.pagetop, .subline, .comhead, .reply, form, .yclinks', units: '.commtext, .toptext' },
  },
  {
    hosts: ['x.com', 'twitter.com'],
    // Posts and bios. Logged out, X has neither, and its sign-in panel, buttons and footer are left out.
    rule: { content: '[data-testid="tweetText"], [data-testid="UserDescription"]', exclude: 'aside, nav, button' },
  },
];

// The rule for a page on this host or a subdomain of a rule's host.
export const siteRule = (hostname: string): SiteRule | null =>
  RULES.find(({ hosts }) => hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)))?.rule ?? null;

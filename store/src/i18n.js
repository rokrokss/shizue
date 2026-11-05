// Store images in another language: open an image as name.html?lang=ko. An element with data-ui
// takes the extension's own string (src/locales/ko.json, which render.sh copies to i18n/ui-ko.js),
// one with data-t the string in i18n/ko.js. data-vars fills a string's {{name}}s: `host=a.example`,
// or `target=@bc.send` for another data-t string. English is the HTML as written.
// With &check=1 the page also lists, in <pre id="i18n-report">, strings that are missing, run out
// of their box or the image, or overlap other text (render.sh --check reads it).
(() => {
  const params = new URLSearchParams(location.search);
  const lang = params.get('lang') || 'en';
  const check = params.has('check');
  if (lang !== 'en') {
    document.write(`<script src="i18n/ui-${lang}.js"><\/script><script src="i18n/${lang}.js"><\/script>`);
  }

  const lookup = (table, path) => path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), table);

  const apply = (report) => {
    const ui = window.STORE_UI ?? {};
    const store = window.STORE_I18N ?? { strings: {} };
    const strings = store.strings ?? {};
    document.documentElement.lang = lang.replace('_', '-');
    const fill = (text, vars) => {
      if (!vars) return text;
      return vars.split(';').reduce((out, pair) => {
        const at = pair.indexOf('=');
        const name = pair.slice(0, at);
        let value = pair.slice(at + 1);
        if (value.startsWith('@')) value = strings[value.slice(1)] ?? `[${value}]`;
        return out.split(`{{${name}}}`).join(value);
      }, text);
    };
    // Arabic, Persian, Urdu: the words run right to left, but the layout stays the English one, so
    // a text keeps its English side. Chat panels, which such a reader sees aligned right, don't.
    // data-rtl: a line that mixes a translated string with untranslated words turns as a whole.
    const rtl = (el) => {
      const align = { start: 'left', end: 'right' }[getComputedStyle(el).textAlign];
      el.dir = 'rtl';
      if (align && !el.closest('.panel')) el.style.textAlign = align;
    };
    for (const el of document.querySelectorAll('[data-ui], [data-t]')) {
      const key = el.dataset.ui ?? el.dataset.t;
      const value = el.dataset.ui ? lookup(ui, key) : strings[key];
      if (typeof value !== 'string') {
        report.push(`missing ${el.dataset.ui ? 'ui' : 't'}: ${key}`);
        continue;
      }
      el.innerHTML = fill(value, el.dataset.vars);
      if (store.rtl) rtl(el.closest('[data-rtl]') ?? el);
    }
  };

  // Where a text's lines are, as boxes.
  const lineBoxes = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].filter((box) => box.width > 0.5 && box.height > 0.5);
  };
  const meets = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

  const inspect = (report) => {
    const canvas = document.querySelector('.canvas').getBoundingClientRect();
    const texts = [...document.querySelectorAll('[data-ui], [data-t]')];
    const name = (el) => el.dataset.ui ?? el.dataset.t;
    for (const el of texts) {
      const boxes = lineBoxes(el);
      if (boxes.some((box) => box.left < canvas.left || box.right > canvas.right || box.top < canvas.top || (box.bottom > canvas.bottom && !el.closest('.browser')))) report.push(`off the image: ${name(el)}`);
      // Cut off by a box that hides what runs out of it (the page, a menu, a panel).
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflow === 'visible') continue;
        const clip = parent.getBoundingClientRect();
        const out = boxes.some((box) => box.left < clip.left - 1 || box.right > clip.right + 1 || box.top < clip.top - 1 || (box.bottom > clip.bottom + 1 && clip.bottom < canvas.bottom));
        if (out && !el.closest('[data-clip-ok]')) report.push(`cut off: ${name(el)}`);
        break;
      }
    }
    // Text running into other text (but a panel drawn over a page, data-overlap-ok), or into the
    // window, player or panels below the headline.
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const [a, b] = [texts[i], texts[j]];
        if (a.contains(b) || b.contains(a) || a.closest('[data-overlap-ok]') || b.closest('[data-overlap-ok]')) continue;
        if (lineBoxes(a).some((x) => lineBoxes(b).some((y) => meets(x, y)))) report.push(`overlap: ${name(a)} / ${name(b)}`);
      }
    }
    const blocks = [...document.querySelectorAll('.browser, .player, .bento, .card, .perch, .lang, .badge, .chips, .canvas > .sprite, .grass')];
    for (const el of document.querySelectorAll('.top [data-ui], .top [data-t], .left [data-t], .tag[data-t]')) {
      for (const block of blocks) {
        if (block.contains(el)) continue;
        const box = block.getBoundingClientRect();
        if (lineBoxes(el).some((line) => meets(line, box))) report.push(`runs into ${block.className.split(' ')[0]}: ${name(el)}`);
      }
    }
    // Words that should keep to one line: chips, menu rows, buttons, tabs.
    const oneLine = '.eyebrow, .chip, .pill, .menu .row, .popover .row, .btns, .cm, .tabs, .srow, .composer .tag, .send, .facts, .lbl, .head, .input';
    for (const el of texts) {
      if (!el.closest(oneLine)) continue;
      const boxes = lineBoxes(el);
      const tallest = Math.max(...boxes.map((box) => box.height));
      const extent = Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top));
      if (extent > tallest * 1.5) report.push(`wraps: ${name(el)}`);
    }
    // A box (a field, a select, a pill) whose words push its other contents, like a ▾, out of it.
    for (const el of texts) {
      const box = [el, el.parentElement].find((node) => {
        const style = getComputedStyle(node);
        return style.overflow === 'visible' && (parseFloat(style.borderTopWidth) > 0 || style.backgroundColor !== 'rgba(0, 0, 0, 0)');
      });
      if (!box || el.closest('[data-clip-ok]')) continue;
      const edge = box.getBoundingClientRect();
      if (lineBoxes(box).some((part) => part.left < edge.left - 1 || part.right > edge.right + 1 || part.top < edge.top - 1 || part.bottom > edge.bottom + 1)) report.push(`overflows its box: ${name(el)}`);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const report = [];
    // ?dump=1: the English data-t strings as JSON, what a language's i18n/<code>.js translates.
    if (params.has('dump')) {
      const strings = {};
      for (const el of document.querySelectorAll('[data-t]')) strings[el.dataset.t] = el.innerHTML.trim();
      const pre = document.createElement('pre');
      pre.id = 'i18n-report';
      pre.textContent = JSON.stringify(strings);
      document.body.append(pre);
      return;
    }
    if (lang !== 'en') apply(report);
    if (!check) return;
    // After the fonts, which change every width.
    document.fonts.ready.then(() => {
      inspect(report);
      const pre = document.createElement('pre');
      pre.id = 'i18n-report';
      pre.hidden = true;
      pre.textContent = [...new Set(report)].join('\n');
      document.body.append(pre);
    });
  });
})();

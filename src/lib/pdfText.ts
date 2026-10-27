// The text of a PDF, page by page, until it has `limit` characters. pdf.js and its worker load
// only when a PDF is read. The CJK character maps some fonts need are extension files, copied to
// pdfjs/cmaps by wxt.config.ts.
export const readPdfText = async (data: ArrayBuffer, limit: number) => {
  const [pdfjs, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({
    data,
    cMapUrl: chrome.runtime.getURL('/pdfjs/cmaps/'),
    cMapPacked: true,
  });
  try {
    const pdf = await task.promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages && text.length < limit; n++) {
      const { items } = await (await pdf.getPage(n)).getTextContent();
      text +=
        items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('') +
        '\n\n';
    }
    return text;
  } finally {
    await task.destroy();
  }
};

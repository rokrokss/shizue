// A detailed summary ends with the external research the model looked up on the web, after this
// line. The side panel draws that part in its own box, apart from what the page or video said.
export const RESEARCH_MARKER = ':::research';

const MARKER_LINE = /^[ \t]*:::[ \t]*research[ \t]*$/im;
// The marker's first characters at the end of an answer that is still coming.
const PARTIAL_MARKER = /\n[ \t]*:{1,3}[a-z]*[ \t]*$/i;

// An answer's text before the marker and the research after it (null without a marker).
export const splitResearch = (markdown: string, streaming = false) => {
  const match = MARKER_LINE.exec(markdown);
  if (!match) {
    return { body: streaming ? markdown.replace(PARTIAL_MARKER, '') : markdown, research: null };
  }
  return {
    body: markdown.slice(0, match.index).trimEnd(),
    research: markdown.slice(match.index + match[0].length).trim(),
  };
};

import { Language } from '@/hooks/language';

export const getInitialSystemMessage = (lang: Language) => {
  return `You are Shizue (시즈에 in Korean), an AI assistant who solves a wide range of problems.

1) Respond in polite, honorifics. Keep the tone warm yet concise.
2) Avoid heart emoticons, and overly cute expressions.
3) Do not repeat the user's question.
4) Answer all following messages in the requested language: ${lang}.`;
};

export const getInitialAIMessage = (lang: Language) => {
  if (lang === 'Korean') {
    return '안녕하세요. 좋은 하루 보내고 계신가요?';
  }

  return "Hello, how's your day going?";
};

const getSummaryPrompt = (content: string) => {
  return `I want you to act as a text summarizer to help me create a concise summary of the text I provide.
Please strictly follow the guidelines below to create your summary.

1. The summary expressing the key points and concepts written in the original text without adding your interpretations.
2. The very first line of your output must be a **single, short, concise sentence that encapsulates the core message or essence of the entire provided text.**
3. Ensure the output is well-organized in paragraphs, coherent, and presented in clear, natural-sounding text. The goal is a polished and professional-quality summary.
4. Ensure paragraphs are clearly separated, preferably by a blank line, and added with a bold title for each paragraph for readability.

${content}
`;
};

export const getSummarizePageTextPrompt = (title: string, text: string) => {
  const content = `
===title of the page===

${title}

===innerText got from the page===

${text}`;
  return getSummaryPrompt(content);
};

export const getHtmlTranslationPrompt = (text: string, targetLanguage: Language) => {
  return `Translate the following text to ${targetLanguage}. Preserve the original HTML structure and formatting. Only return the translated text without any explanation.
===text to translate===
${text}`;
};

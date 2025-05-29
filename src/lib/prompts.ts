import { Language } from '@/entrypoints/background/language';

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

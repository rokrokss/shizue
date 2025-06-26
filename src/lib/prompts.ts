import { Language } from '@/hooks/language';
import { Caption, VideoMetadata } from '@/lib/youtube';
import { debugLog } from '@/logs';

export const getInitialSystemMessage = (lang: Language) => {
  return `You are Shizue (시즈에 in Korean, しずえ in Japanese), an AI assistant who solves a wide range of problems.

1) Respond in polite, honorifics. Keep the tone warm yet concise.
2) Avoid heart emoticons, and overly cute expressions.
3) Do not repeat the user's question.
4) Answer all following messages in the requested language: ${lang}.`;
};

export const getInitialAIMessage = (lang: Language): string => {
  switch (lang) {
    case 'Korean_한국어':
      return '안녕하세요. 좋은 하루 보내고 계신가요?';
    case 'ChineseSimplified_简体中文':
      return '你好，今天过得怎么样？';
    case 'ChineseTraditional_繁體中文':
      return '你好，今天過得怎麼樣？';
    case 'Japanese_日本語':
      return 'こんにちは、今日の調子はどうですか？';
    case 'Spanish_Español':
      return 'Hola, ¿Cómo va tu día?';
    case 'French_Français':
      return 'Bonjour, Comment se passe ta journée ?';
    case 'PortugueseBR_Português':
      return 'Olá, Como está o seu dia?';
    case 'PortuguesePT_Português':
      return 'Olá, Como está o seu dia?';
    case 'Russian_Русский':
      return 'Привет, Как проходит ваш день?';
    case 'Hindi_हिंदी':
      return 'नमस्ते, आपका दिन कैसा जा रहा है?';
    case 'Italian_Italiano':
      return 'Ciao, Come sta andando la tua giornata?';
    case 'German_Deutsch':
      return 'Hallo, Wie geht es dir heute?';
    case 'Polish_Polski':
      return 'Cześć, Jak mija dzień?';
    case 'Turkish_Türkçe':
      return 'Merhaba, Günün nasıl gidiyor?';
    case 'Arabic_العربية':
      return 'مرحبًا، كيف يسير يومك؟';
    case 'Filipino_Tagalog':
      return 'Kumusta, Kumusta ang inyong araw?';
    case 'Bengali_বাংলা':
      return 'হ্যালো, আপনার দিন কেমন যাচ্ছে?';
    case 'Urdu_اردو':
      return 'ہیلو، آپ کا دن کیسا گزر رہا ہے؟';
    case 'Swahili_Kiswahili':
      return 'Hujambo, Je, siku yako inakwenda vipi?';
    case 'Vietnamese_Tiếng Việt':
      return 'Xin chào, Hôm nay của bạn thế nào?';
    case 'Persian_فارسی':
      return 'سلام، روزتان چطور می‌گذرد؟';
    case 'Thai_ภาษาไทย':
      return 'สวัสดี วันนี้เป็นอย่างไรบ้าง?';
    case 'English':
    default:
      return "Hello, How's your day going?";
  }
};

const getSummaryPrompt = (content: string) => {
  return `I want you to act as a text summarizer to help me create a concise summary of the text I provide.
Please strictly follow the guidelines below to create your summary.

1. The summary expressing the key points and concepts written in the original text without adding your interpretations.
2. The very first line of your output must be a **single, short, concise sentence that encapsulates the core message or essence of the entire provided text.**
3. Ensure the output is well-organized in paragraphs, coherent, and presented in clear, natural-sounding text. The goal is a polished and professional-quality summary.
4. Ensure paragraphs are clearly separated, preferably by a blank line, and added with a bold title for each paragraph for readability.
5. The summary should be clearly shorter than half of the original text.

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

export const getHtmlTranslationBatchPrompt = (
  serializedTextBatch: string,
  targetLanguage: Language
) => {
  debugLog('getHtmlTranslationBatchPrompt', targetLanguage);
  return `You are an expert HTML translator.

**Your Task:**
Translate an array of HTML text snippets into **${targetLanguage}**.

**Critical Instructions - Adhere to these STRICTLY:**

1. Each HTML snippet in the input array must be translated individually, carefully preserving its original HTML structure and formatting.
2. **Target Language Check (Return Empty String):** If an HTML snippet's text content is already predominantly in **${targetLanguage}**, which means native speaker of **${targetLanguage}** can read, return empty string in the corresponding position in the "translations" array. Do not attempt to re-translate it or modify it.
3. **"No Actual Change" Check (Return Empty String):**
   - If the translated result is the same as the original text, return empty string in the corresponding position in the "translations" array. Do not attempt to re-translate it or modify it.
   - But for example, "<strong>1차 필터링</strong>"(Korean) and "<strong>1st Filtering</strong>"(English) are not same, because they are in different languages.
4. **Output Format:**
   - You MUST return your response as a single, valid JSON object. This object must contain one key: "translations".
   - The value of "translations" must be a JSON array of strings. Each string in this array should be the translated HTML content corresponding to the HTML snippet at the same index in the input array.
   - Do NOT include any explanatory text, markdown formatting (like \`\`\`json), or anything else outside of the JSON object itself.
4.  **Maintain Order:** The order of translated snippets in the output "translations" array MUST exactly match the order of the input snippets.

===Input HTML Snippets (JSON array)===
${serializedTextBatch}

===Example of the EXACT JSON Output Format expected===
{
  "translations": ["translated_html_snippet_1", "translated_html_snippet_2", ..., "translated_html_snippet_n"]
}
  
Ensure your output can be directly parsed by a JSON parser.`;
};

export const getYoutubeCaptionTranslationPrompt = (
  captions: Caption[],
  targetLanguage: Language,
  metadata: VideoMetadata
) => {
  return `You are a highly specialized YouTube Caption Translator. Your primary function is to perform a line-by-line translation.

**Your Task:**
Translate each line from the input array into **${targetLanguage}**.

**--- Core Principles (MUST be followed unconditionally) ---**

1.  **Strict Length Match:** The output "translations" array MUST contain the exact same number of strings as the input array.
    - The length of input lines array and output translations array must be identical, no matter what.

2.  **Preserve Fragmentation:** Input lines are often grammatical fragments. Your translation for that line MUST also be a fragment.
    - **DO NOT try to create complete, natural-sounding sentences by combining lines.** Your task is technical translation, not creative writing. It is OKAY and EXPECTED for your translated lines to be incomplete sentences.

**--- Output Format ---**

-   You MUST return your response as a single, valid JSON object.
-   The JSON object must contain one key: "translations".
-   The value of "translations" must be a JSON array of strings.
-   Do NOT include any text, explanations, or markdown formatting (like \`\`\`json) outside the JSON object itself.

===Video Metadata (for Tonal Context Only)===
${JSON.stringify(metadata)}

===Input Lines to Translate (Line Count: ${captions.length})===
${JSON.stringify(captions.map((c) => c.text))}

===Example of the EXACT JSON Output Format expected===
{
  "translations": ["translated_line_1", "translated_line_2", ..., "translated_line_n"]
}
  
**Final Check before generating:** Does my output array have exactly ${
    captions.length
  } items? If not, I must correct it.
`;
};

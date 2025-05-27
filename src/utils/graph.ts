// import { getCurrentLanguage } from '@/entrypoints/background/language';
// import { ChatOpenAI } from '@langchain/openai';
// import { getInitialSystemMessage } from './prompts';

// export const llm = new ChatOpenAI({
//   modelName: 'chatgpt-4o-latest',
//   temperature: 0.7,
//   apiKey: await chrome.storage.local.get('API_KEY').then((v) => v['API_KEY']),
// });

// export async function composePrompt(threadMsgs: any[]) {
//   const initialSystemMessage = getInitialSystemMessage(getCurrentLanguage());

//   return [
//     { role: 'system', content: initialSystemMessage },
//     ...threadMsgs.map((m) => ({ role: m.role, content: m.content })),
//   ];
// }
// chrome.storage.local.get(STORAGE_LANGUAGE, (res) => {
//   if (res.LANGUAGE) changeLanguage(res.LANGUAGE as Language);
// });

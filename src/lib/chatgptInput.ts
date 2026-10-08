import type { BaseMessage } from '@langchain/core/messages';

export function chatGPTInput(messages: BaseMessage[], jsonOutput = false) {
  const instructions: string[] = [];
  const input: { role: 'user' | 'assistant' | 'developer'; content: unknown }[] = [];
  for (const message of messages) {
    const type = message.type;
    if (type === 'system') {
      if (typeof message.content !== 'string') throw new Error('ChatGPT system instructions must be text.');
      instructions.push(message.content);
      continue;
    }
    const role = type === 'human' ? 'user' : type === 'ai' ? 'assistant' : undefined;
    if (!role) throw new Error(`Unsupported ChatGPT message type: ${type}`);
    if (typeof message.content === 'string') {
      input.push({ role, content: message.content });
      continue;
    }
    const content = message.content.map((part) => {
      if (typeof part === 'string') return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part };
      if (part.type === 'text') return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text };
      if (part.type === 'image_url' && role === 'user') {
        const image = part.image_url;
        const url = typeof image === 'string' ? image : image && typeof image === 'object' && 'url' in image ? image.url : undefined;
        if (typeof url !== 'string') throw new Error('Invalid ChatGPT image input.');
        return { type: 'input_image', image_url: url };
      }
      throw new Error(`Unsupported ChatGPT content: ${part.type}`);
    });
    input.push({ role, content });
  }
  if (jsonOutput) instructions.push('Return only a valid JSON object matching the format requested by the user.');
  return { input, ...(instructions.length ? { instructions: instructions.join('\n\n') } : {}) };
}

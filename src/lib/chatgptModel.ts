import { BaseChatModel, type BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { chatGPTInput } from './chatgptInput';
import { nativeResponseStream } from '@/services/background/chatgptNative';

// Adapts the official Responses stream to the same interface used by chat and translation.
export class ChatGPTPlanModel extends BaseChatModel {
  constructor(
    private readonly model: string,
    private readonly jsonOutput: boolean,
    private readonly reasoningEffort?: 'none' | 'low',
  ) { super({}); }
  _llmType() { return 'chatgpt-plan'; }
  override async *_streamResponseChunks(messages: BaseMessage[], options: BaseChatModelCallOptions) {
    const payload = {
      model: this.model,
      ...chatGPTInput(messages, this.jsonOutput),
      ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
    };
    for await (const event of nativeResponseStream(payload, options.signal)) {
      const message = new AIMessageChunk({ content: event.delta || '', ...(event.usage ? { usage_metadata: event.usage } : {}) });
      yield new ChatGenerationChunk({ text: event.delta || '', message });
    }
  }
  async _generate(messages: BaseMessage[], options: BaseChatModelCallOptions): Promise<ChatResult> {
    let generation: ChatGenerationChunk | undefined;
    for await (const chunk of this._streamResponseChunks(messages, options)) generation = generation ? generation.concat(chunk) : chunk;
    if (!generation) throw new Error('ChatGPT completed without a response.');
    return { generations: [generation] };
  }
}

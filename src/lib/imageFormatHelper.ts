import { ChatModel, ConnectionMode, MODELS, providerFromName } from './modelRegistry';

interface ImageContent {
  type: string;
  [key: string]: any;
}

export const parseDataUrl = (dataUrl: string): { mediaType: string; base64Data: string } => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }
  return {
    mediaType: match[1],
    base64Data: match[2],
  };
};

export const formatImageForProvider = (
  imageDataUrl: string,
  modelName: string,
  connectionMode: ConnectionMode
): ImageContent => {
  const provider = providerFromName(modelName);
  
  // OpenRouter takes the image_url format for Claude too.
  if (provider === 'anthropic-api-key' && connectionMode === 'direct') {
    // Anthropic expects a different format
    const { mediaType, base64Data } = parseDataUrl(imageDataUrl);
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Data,
      },
    };
  } else {
    // OpenAI and Gemini use the image_url format
    return {
      type: 'image_url',
      image_url: { url: imageDataUrl },
    };
  }
};

export const formatImagesForMessage = (
  images: string[],
  modelName: ChatModel,
  connectionMode: ConnectionMode
): ImageContent[] => {
  // Text-only models reject any request with an image, so earlier images in the thread become a note.
  if (!MODELS[modelName].supportsImages) {
    return [
      {
        type: 'text',
        text: `[${images.length} image(s) omitted: the current model does not accept images]`,
      },
    ];
  }
  return images.map((img) => formatImageForProvider(img, modelName, connectionMode));
};
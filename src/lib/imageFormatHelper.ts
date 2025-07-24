import { providerFromName } from './models';

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
  modelName: string
): ImageContent => {
  const provider = providerFromName(modelName);
  
  if (provider === 'anthropic-api-key') {
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
  modelName: string
): ImageContent[] => {
  return images.map((img) => formatImageForProvider(img, modelName));
};
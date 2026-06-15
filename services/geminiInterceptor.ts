import { GoogleGenAI } from '@google/genai';

// Helper for exponential backoff sleep
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to determine if an error is retryable (like 503 or 429)
export function isRetryableError(error: any): boolean {
  if (!error) return false;
  const errMsg = (error.message || String(error)).toLowerCase();
  const statusStr = String(error.status || '').toLowerCase();
  const code = String(error.code || error.statusCode || '');

  // Do not retry if prepaid credits are depleted
  if (errMsg.includes('depleted') || errMsg.includes('prepay') || errMsg.includes('billing')) {
    return false;
  }

  return (
    code.includes('503') ||
    code.includes('429') ||
    statusStr.includes('unavailable') ||
    statusStr.includes('resource_exhausted') ||
    errMsg.includes('503') ||
    errMsg.includes('429') ||
    errMsg.includes('high demand') ||
    errMsg.includes('temporary') ||
    errMsg.includes('try again later') ||
    errMsg.includes('unavailable') ||
    errMsg.includes('resource_exhausted') ||
    errMsg.includes('quota')
  );
}

// Helper to check if a model name is a standard flash model that can fall back to lite
export function canFallbackToLite(modelName: string): boolean {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  // We can fall back from gemini-3.5-flash or gemini-2.5-flash to gemini-3.1-flash-lite
  return (lower.includes('3.5-flash') || lower.includes('2.5-flash')) && !lower.includes('image');
}

const wrappedModels = new Map<any, any>();

Object.defineProperty(GoogleGenAI.prototype, 'models', {
  get() {
    const rawModels = this._rawModels;
    if (!rawModels) return undefined;

    if (!wrappedModels.has(rawModels)) {
      const wrapper = Object.create(rawModels);

      // Wrap generateContent
      if (typeof rawModels.generateContent === 'function') {
        wrapper.generateContent = async function (params: any, ...args: any[]) {
          let lastError: any = null;
          let currentModel = params?.model || 'gemini-3.5-flash';
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount <= maxRetries) {
            try {
              const currentParams = {
                ...params,
                model: currentModel,
              };
              return await rawModels.generateContent.call(rawModels, currentParams, ...args);
            } catch (error: any) {
              lastError = error;
              console.warn(`[Gemini Interceptor] generateContent failed (attempt ${retryCount + 1}/${maxRetries + 1}) with error:`, error);

              if (isRetryableError(error)) {
                if (canFallbackToLite(currentModel)) {
                  console.warn(`[Gemini Interceptor] High demand detected for ${currentModel}. Falling back to gemini-3.1-flash-lite.`);
                  currentModel = 'gemini-3.1-flash-lite';
                }

                retryCount++;
                if (retryCount <= maxRetries) {
                  const delay = Math.pow(2, retryCount) * 500 + Math.random() * 300;
                  await sleep(delay);
                  continue;
                }
              }
              throw error;
            }
          }
          throw lastError;
        };
      }

      // Wrap generateContentStream
      if (typeof rawModels.generateContentStream === 'function') {
        wrapper.generateContentStream = async function (params: any, ...args: any[]) {
          let lastError: any = null;
          let currentModel = params?.model || 'gemini-3.5-flash';
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount <= maxRetries) {
            try {
              const currentParams = {
                ...params,
                model: currentModel,
              };
              return await rawModels.generateContentStream.call(rawModels, currentParams, ...args);
            } catch (error: any) {
              lastError = error;
              console.warn(`[Gemini Interceptor] generateContentStream failed (attempt ${retryCount + 1}/${maxRetries + 1}) with error:`, error);

              if (isRetryableError(error)) {
                if (canFallbackToLite(currentModel)) {
                  console.warn(`[Gemini Interceptor] High demand detected for ${currentModel}. Falling back stream to gemini-3.1-flash-lite.`);
                  currentModel = 'gemini-3.1-flash-lite';
                }

                retryCount++;
                if (retryCount <= maxRetries) {
                  const delay = Math.pow(2, retryCount) * 500 + Math.random() * 300;
                  await sleep(delay);
                  continue;
                }
              }
              throw error;
            }
          }
          throw lastError;
        };
      }

      // Preserve all other methods (generateImages, list, editImage, generateVideos)
      for (const key of Object.getOwnPropertyNames(rawModels).concat(Object.keys(rawModels))) {
        if (key !== 'generateContent' && key !== 'generateContentStream' && typeof rawModels[key] === 'function') {
          if (!wrapper[key]) {
            wrapper[key] = rawModels[key].bind(rawModels);
          }
        }
      }

      wrappedModels.set(rawModels, wrapper);
    }
    return wrappedModels.get(rawModels);
  },
  set(val) {
    this._rawModels = val;
  }
});

const wrappedChats = new Map<any, any>();

Object.defineProperty(GoogleGenAI.prototype, 'chats', {
  get() {
    const rawChats = this._rawChats;
    if (!rawChats) return undefined;

    if (!wrappedChats.has(rawChats)) {
      const wrapper = Object.create(rawChats);

      if (typeof rawChats.create === 'function') {
        wrapper.create = function (config: any, ...args: any[]) {
          const chatInstance = rawChats.create.call(rawChats, config, ...args);

          // Wrap sendMessage on the returned chatInstance
          const originalSendMessage = chatInstance.sendMessage;
          if (typeof originalSendMessage === 'function') {
            chatInstance.sendMessage = async function (params: any, ...args2: any[]) {
              let lastError: any = null;
              let retryCount = 0;
              const maxRetries = 3;

              while (retryCount <= maxRetries) {
                try {
                  return await originalSendMessage.call(chatInstance, params, ...args2);
                } catch (error: any) {
                  lastError = error;
                  console.warn(`[Gemini Interceptor] sendMessage failed (attempt ${retryCount + 1}/${maxRetries + 1}) with error:`, error);

                  if (isRetryableError(error)) {
                    if (canFallbackToLite(chatInstance.model)) {
                      console.warn(`[Gemini Interceptor] High demand detected for ${chatInstance.model}. Falling back chat to gemini-3.1-flash-lite.`);
                      chatInstance.model = 'gemini-3.1-flash-lite';
                    }

                    retryCount++;
                    if (retryCount <= maxRetries) {
                      const delay = Math.pow(2, retryCount) * 500 + Math.random() * 300;
                      await sleep(delay);
                      continue;
                    }
                  }
                  throw error;
                }
              }
              throw lastError;
            };
          }

          // Wrap sendMessageStream on the returned chatInstance
          const originalSendMessageStream = chatInstance.sendMessageStream;
          if (typeof originalSendMessageStream === 'function') {
            chatInstance.sendMessageStream = async function (params: any, ...args2: any[]) {
              let lastError: any = null;
              let retryCount = 0;
              const maxRetries = 3;

              while (retryCount <= maxRetries) {
                try {
                  return await originalSendMessageStream.call(chatInstance, params, ...args2);
                } catch (error: any) {
                  lastError = error;
                  console.warn(`[Gemini Interceptor] sendMessageStream failed (attempt ${retryCount + 1}/${maxRetries + 1}) with error:`, error);

                  if (isRetryableError(error)) {
                    if (canFallbackToLite(chatInstance.model)) {
                      console.warn(`[Gemini Interceptor] High demand detected for ${chatInstance.model}. Falling back stream chat to gemini-3.1-flash-lite.`);
                      chatInstance.model = 'gemini-3.1-flash-lite';
                    }

                    retryCount++;
                    if (retryCount <= maxRetries) {
                      const delay = Math.pow(2, retryCount) * 500 + Math.random() * 300;
                      await sleep(delay);
                      continue;
                    }
                  }
                  throw error;
                }
              }
              throw lastError;
            };
          }

          return chatInstance;
        };
      }

      // Preserve all other methods
      for (const key of Object.getOwnPropertyNames(rawChats).concat(Object.keys(rawChats))) {
        if (key !== 'create' && typeof rawChats[key] === 'function') {
          if (!wrapper[key]) {
            wrapper[key] = rawChats[key].bind(rawChats);
          }
        }
      }

      wrappedChats.set(rawChats, wrapper);
    }
    return wrappedChats.get(rawChats);
  },
  set(val) {
    this._rawChats = val;
  }
});

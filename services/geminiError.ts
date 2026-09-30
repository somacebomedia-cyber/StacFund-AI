export function isQuotaError(error: any): boolean {
  if (!error) return false;
  const message = (error.message || String(error)).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('resource_exhausted') ||
    message.includes('prepayment') ||
    message.includes('depleted') ||
    message.includes('quota') ||
    message.includes('api key not valid') ||
    message.includes('api_key_invalid') ||
    message.includes('invalid_argument')
  );
}

export function isHtmlGatewayError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || String(error)).toLowerCase();
  return msg.includes('<!doctype') || msg.includes('unexpected token') || msg.includes('not valid json');
}

export function handleGeminiError(error: any) {
  if (isQuotaError(error)) {
    console.warn("Gemini Quota Error caught. Show UI warning.");
    const customEvent = new CustomEvent('gemini_quota_error', {
      detail: {
        message: error.message || "Your prepayment credits are depleted on AI Studio. Please manage your projects and billing.",
        raw: error
      }
    });
    window.dispatchEvent(customEvent);
  } else if (isHtmlGatewayError(error)) {
    console.warn("Gemini service temporarily unreachable or returned gateway response:", error?.message || error);
  } else {
    console.error("Gemini API Error caught:", error);
  }
}

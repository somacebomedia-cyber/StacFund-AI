export function isQuotaError(error: any): boolean {
  if (!error) return false;
  const message = (error.message || String(error)).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('resource_exhausted') ||
    message.includes('prepayment') ||
    message.includes('depleted') ||
    message.includes('quota')
  );
}

export function handleGeminiError(error: any) {
  console.error("Gemini API Error caught:", error);
  if (isQuotaError(error)) {
    const customEvent = new CustomEvent('gemini_quota_error', {
      detail: {
        message: error.message || "Your prepayment credits are depleted on AI Studio. Please manage your projects and billing.",
        raw: error
      }
    });
    window.dispatchEvent(customEvent);
  }
}

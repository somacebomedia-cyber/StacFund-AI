// utils/planPdfExport.ts
/**
 * StacFund — Business plan PDF export (text-based, searchable)
 * ============================================================
 * The long-form business plan exports as a REAL text PDF, not a canvas
 * screenshot: 90 pages of selectable, searchable text at a fraction of the
 * image-PDF file size — what a bank credit committee expects.
 *
 * Primary path : serialise the paginated preview pages to standalone HTML
 *                (they are inline-styled by design) → POST to the server's
 *                Playwright endpoint → Chromium prints to PDF (A4, exact).
 * Fallback path: if the server endpoint is unavailable, degrade to the
 *                existing canvas image exporter (utils/pdfExporter) so the
 *                user still gets a file.
 */
import { auth } from '../services/firebase';
import { exportElementsToPdf } from './pdfExporter';

const EXPORT_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=Inter:wght@400;600;700&display=swap';

export interface PlanPdfResult {
  ok: boolean;
  mode: 'text' | 'image' | null;
  error?: string;
  failedPages?: number[];
}

function buildStandaloneHtml(pages: HTMLElement[]): string {
  const body = pages.map((p) => p.outerHTML).join('\n');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${EXPORT_FONTS_HREF}" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  .pdf-page { width: 794px; height: 1123px; page-break-after: always; position: relative; overflow: hidden; }
  .pdf-page:last-child { page-break-after: auto; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
  const user = auth.currentUser;
  if (user) {
    try {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    } catch { /* proceed unauthenticated; server will decide */ }
  }
  return headers;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Exports the rendered `.pdf-page` elements to a text-based A4 PDF.
 * @param pages  the live page elements from the preview container
 */
export async function exportPlanToPdf(
  pages: HTMLElement[],
  filename: string,
  opts: { onProgress?: (msg: string) => void } = {}
): Promise<PlanPdfResult> {
  if (!pages.length) return { ok: false, mode: null, error: 'Nothing to export yet.' };

  // ── Primary: server-side Chromium print (selectable text) ──
  try {
    opts.onProgress?.('Preparing pages…');
    const html = buildStandaloneHtml(pages);

    opts.onProgress?.('Rendering PDF (this can take a minute for 70+ pages)…');
    const res = await fetch(
      `/api/plan/export-pdf?filename=${encodeURIComponent(filename)}`,
      { method: 'POST', headers: await authHeaders(), body: html }
    );

    if (!res.ok) {
      let detail = `Server responded ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) detail = j.error;
      } catch { /* not json */ }
      throw new Error(detail);
    }

    const blob = await res.blob();
    if (blob.size < 1024) throw new Error('The rendered PDF came back empty.');
    triggerDownload(blob, filename);
    return { ok: true, mode: 'text' };
  } catch (e) {
    console.warn('[planPdfExport] text-PDF path failed, falling back to image export', e);
  }

  // ── Fallback: canvas image export (always works client-side) ──
  try {
    opts.onProgress?.('Text renderer unavailable — exporting as image PDF…');
    const result = await exportElementsToPdf(pages, filename, {
      widthPx: 794,
      widthMm: 210,
      maxHeightMm: 297,
      overflowMode: 'slice',
      backgroundColor: '#FFFFFF',
      jpegQuality: 0.92,
    });
    return { ok: true, mode: 'image', failedPages: result.failedPages };
  } catch (e) {
    return {
      ok: false,
      mode: null,
      error: e instanceof Error ? e.message : 'Export failed. Please try again.',
    };
  }
}

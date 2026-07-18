/**
 * Unified PDF export pipeline.
 *
 * Replaces three independent implementations that had drifted apart:
 *   - BusinessPlanDocument.tsx (html2canvas + jsPDF, forced-height capture)
 *   - PitchDeckDocument.tsx    (html2canvas + jsPDF, forced-height capture)
 *   - PresentationDesigner.tsx (window.print() — a different mechanism entirely)
 *
 * Fixes applied here that the old per-component code did not have:
 *
 *  1. NEVER force a capture height shorter than the element's natural content
 *     height. The old code forced height:1123px (or SLIDE_HEIGHT_PX) inside
 *     an overflow-hidden container, which silently cropped any section whose
 *     AI-generated content ran long — no error, just missing content in the
 *     downloaded PDF. Because content length varies per Gemini response, this
 *     bug is non-deterministic: it won't show up in a short QA test case and
 *     will bite real users unpredictably, on whichever page happens to run
 *     long for them.
 *
 *  2. Waits for `document.fonts.ready` before the first capture, so custom
 *     web fonts (Inter / Lato / Cormorant Garamond / Unbounded, all loaded
 *     via Google Fonts <link> tags in index.html) have actually finished
 *     loading. Without this, page 1 can be captured before fonts arrive and
 *     render in a fallback system font, while later pages (captured after
 *     fonts load in the background) look correct — a confusing, first-page-
 *     only bug.
 *
 *  3. Uses `useCORS` only — no `allowTaint`. The two together don't add
 *     safety, they just delay the failure: an image that fails CORS still
 *     taints the canvas, and a tainted canvas throws on `toDataURL()`
 *     regardless of `allowTaint`. Under the old code that exception took
 *     down the entire multi-page export from a single bad image anywhere in
 *     the document. Here, each element's capture is isolated — one broken
 *     image degrades just that one page (renders an error notice) instead of
 *     silently killing the whole export with no file and no explanation.
 *
 *  4. Long content is never cropped. Two overflow strategies:
 *       - 'slice'  — content taller than one page is split across multiple
 *                    pages at full quality (business plan: long-form text,
 *                    an extra page is normal and expected).
 *       - 'expand' — the whole element is scaled down to fit one page
 *                    instead of being split (pitch deck: splitting a single
 *                    slide across two PDF pages would look broken; a rare
 *                    over-long slide shrinks slightly instead).
 */

export interface CaptureResult {
  canvas: HTMLCanvasElement | null;
  error?: string;
}

export type OverflowMode = 'slice' | 'expand';

export interface PdfPageOptions {
  /** Target width of the PDF page, in mm. */
  widthMm: number;
  /** Standard page height, in mm. Content taller than this triggers overflowMode handling. */
  maxHeightMm: number;
  overflowMode: OverflowMode;
  jpegQuality?: number;
}

let fontsReadyPromise: Promise<void> | null = null;

/** Waits for web fonts to finish loading. Resolves immediately after the first call in a page session. */
function waitForFonts(): Promise<void> {
  if (!fontsReadyPromise) {
    fontsReadyPromise =
      typeof document !== 'undefined' && 'fonts' in document
        ? (document as any).fonts.ready.then(() => undefined)
        : Promise.resolve();
  }
  return fontsReadyPromise;
}

/**
 * Waits for any not-yet-loaded <img> elements inside `element` to finish
 * loading (or fail) before capture, since slides/pages can contain
 * async-loaded stock photos or AI-generated images. A broken image resolves
 * (doesn't reject) so it can't hang the export; a timeout caps the wait so
 * one slow image doesn't stall the whole document.
 */
async function waitForImages(element: HTMLElement, timeoutMs = 4000): Promise<void> {
  const pending = Array.from(element.querySelectorAll('img')).filter((img) => !img.complete);
  if (!pending.length) return;

  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Captures one DOM element to a canvas at its natural content height.
 * Never crops — omitting `height`/`windowHeight` lets html2canvas capture
 * the full scrollHeight. Errors are returned, not thrown, so a batch export
 * can isolate a single bad page instead of aborting entirely.
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  opts: { scale?: number; backgroundColor?: string; widthPx: number }
): Promise<CaptureResult> {
  const html2canvasLib = (await import('html2canvas')).default;
  await waitForFonts();
  await waitForImages(element);

  try {
    const canvas = await html2canvasLib(element, {
      scale: opts.scale ?? 2,
      useCORS: true,
      backgroundColor: opts.backgroundColor ?? '#3B0764',
      logging: false,
      width: opts.widthPx,
      windowWidth: opts.widthPx,
      // No height / windowHeight override: capturing at natural scrollHeight
      // is what prevents the clipping bug. Normal-length content still looks
      // identical to before; only overflow content is now actually captured.
    });
    return { canvas };
  } catch (err) {
    return { canvas: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Adds a captured canvas to a jsPDF document per `overflowMode`.
 * Mutates `pdf` in place. `isFirstPageOfDocument` must be true only for the
 * very first element added (jsPDF's page 1 already exists at construction).
 */
export function addCanvasToPdf(
  pdf: any,
  canvas: HTMLCanvasElement,
  opts: PdfPageOptions,
  isFirstPageOfDocument: boolean
): { pagesAdded: number; hadOverflow: boolean } {
  const { widthMm, maxHeightMm, overflowMode, jpegQuality = 0.85 } = opts;
  const naturalHeightMm = (canvas.height / canvas.width) * widthMm;
  const overflows = naturalHeightMm > maxHeightMm + 0.5; // small tolerance for rounding

  if (!isFirstPageOfDocument) pdf.addPage();

  if (overflowMode === 'expand') {
    if (!overflows) {
      pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, widthMm, naturalHeightMm);
    } else {
      // Shrink the whole slide to fit one page rather than splitting it —
      // guarantees no content is lost and every page stays the same size.
      const scale = maxHeightMm / naturalHeightMm;
      const fitWidthMm = widthMm * scale;
      const xOffsetMm = (widthMm - fitWidthMm) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', xOffsetMm, 0, fitWidthMm, maxHeightMm);
    }
    return { pagesAdded: 1, hadOverflow: overflows };
  }

  // 'slice' mode
  if (!overflows) {
    pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, widthMm, naturalHeightMm);
    return { pagesAdded: 1, hadOverflow: false };
  }

  const pxPerMm = canvas.width / widthMm;
  const sliceHeightPx = Math.floor(maxHeightMm * pxPerMm);
  let remainingPx = canvas.height;
  let offsetPx = 0;
  let pagesAdded = 0;

  while (remainingPx > 0) {
    const thisSlicePx = Math.min(sliceHeightPx, remainingPx);
    if (pagesAdded > 0) pdf.addPage();

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = thisSlicePx;
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) ctx.drawImage(canvas, 0, offsetPx, canvas.width, thisSlicePx, 0, 0, canvas.width, thisSlicePx);

    const sliceHeightMm = (thisSlicePx / canvas.width) * widthMm;
    pdf.addImage(sliceCanvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, widthMm, sliceHeightMm);
    sliceCanvas.width = 0;
    sliceCanvas.height = 0;

    offsetPx += thisSlicePx;
    remainingPx -= thisSlicePx;
    pagesAdded++;
  }

  return { pagesAdded, hadOverflow: true };
}

export interface ExportElementsToPdfOptions {
  widthPx: number;
  widthMm: number;
  maxHeightMm: number;
  overflowMode: OverflowMode;
  backgroundColor?: string;
  jpegQuality?: number;
  scale?: number;
  onProgress?: (current: number, total: number) => void;
  isCancelled?: () => boolean;
}

export interface ExportResult {
  succeeded: number;
  failedPages: number[];
}

/**
 * Batch export for the "all pages already in the DOM" case
 * (BusinessPlanDocument, PitchDeckDocument): finds elements, captures each
 * in sequence, builds one PDF. A failed page is noted in the output and
 * replaced with a placeholder page instead of aborting the whole export.
 */
export async function exportElementsToPdf(
  elements: HTMLElement[],
  filename: string,
  opts: ExportElementsToPdfOptions
): Promise<ExportResult> {
  if (!elements.length) {
    throw new Error('No pages found to export.');
  }

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    unit: 'mm',
    format: [opts.widthMm, opts.maxHeightMm],
    orientation: opts.widthMm > opts.maxHeightMm ? 'landscape' : 'portrait',
  });

  const failedPages: number[] = [];
  let addedAnyPage = false;

  for (let i = 0; i < elements.length; i++) {
    if (opts.isCancelled?.()) {
      throw new Error('Export cancelled by user');
    }
    opts.onProgress?.(i + 1, elements.length);

    const { canvas, error } = await captureElementToCanvas(elements[i], {
      scale: opts.scale,
      backgroundColor: opts.backgroundColor,
      widthPx: opts.widthPx,
    });

    if (!canvas) {
      failedPages.push(i + 1);
      console.error(`Export: page ${i + 1} failed to capture:`, error);
      if (addedAnyPage) pdf.addPage();
      pdf.setFontSize(14);
      pdf.text('This page failed to render. Please try exporting again.', 10, 20);
      addedAnyPage = true;
      continue;
    }

    addCanvasToPdf(
      pdf,
      canvas,
      {
        widthMm: opts.widthMm,
        maxHeightMm: opts.maxHeightMm,
        overflowMode: opts.overflowMode,
        jpegQuality: opts.jpegQuality,
      },
      !addedAnyPage
    );
    addedAnyPage = true;

    canvas.width = 0;
    canvas.height = 0;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  pdf.save(filename);
  return { succeeded: elements.length - failedPages.length, failedPages };
}

/**
 * Creates a jsPDF document for the "slides mounted one at a time into a
 * hidden container" case (PresentationDesigner). Caller drives the loop
 * (it needs to mount each slide via React between captures); this just
 * wraps document creation + save so all three components share the same
 * page-sizing and save logic.
 */
export async function createPdfDocument(widthMm: number, maxHeightMm: number): Promise<any> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({
    unit: 'mm',
    format: [widthMm, maxHeightMm],
    orientation: widthMm > maxHeightMm ? 'landscape' : 'portrait',
  });
}

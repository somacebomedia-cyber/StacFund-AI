// ─────────────────────────────────────────────────────────────────────────────
// videoExporter.ts
//
// Records the pitch deck as a video by:
//   1. Creating a recording canvas at the target resolution
//   2. Using canvas.captureStream(fps) to get a MediaStream
//   3. Recording the stream with MediaRecorder
//   4. For each slide, calling the `paintSlide` callback to render the slide
//      onto the canvas, then holding for `secondsPerSlide` seconds
//   5. Producing a Blob (WebM in most browsers, MP4 in Safari)
//
// The caller provides a `paintSlide(slide, canvas, width, height, index)`
// callback
// that's responsible for rendering the slide onto the canvas — typically using
// html2canvas to rasterize a React-rendered SlideRenderer component.
//
// Browser support:
//   - Chrome/Edge: WebM (VP9/VP8) — works great
//   - Firefox: WebM (VP8) — works great
//   - Safari 14+: MP4 (H.264) — works
//   - Safari < 14: not supported — we surface a clear error
// ─────────────────────────────────────────────────────────────────────────────

// Slide type — to avoid a circular import with PresentationDesigner (which
// imports from this file), we declare a local SlideShape that matches the
// Slide interface in PresentationDesigner. Callers pass Slide[] which is
// structurally compatible (TypeScript uses structural typing).
export type AnySlide = {
  id: string;
  type: 'cover' | 'content' | 'data' | 'quote';
  title: string;
  points: string[];
  [key: string]: any;
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VideoExportOptions {
  /** Seconds each slide stays on screen (default: 3). */
  secondsPerSlide?: number;
  /** Frames per second (default: 30). */
  fps?: number;
  /** Output video width in pixels (default: 1280 — 720p 16:9). */
  width?: number;
  /** Output video height in pixels (default: 720). */
  height?: number;
  /** Called when each slide is being captured. */
  onProgress?: (current: number, total: number, slideTitle: string) => void;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export interface VideoExportResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationSeconds: number;
}

// Paint callback: caller renders the slide onto the provided canvas.
// `index` is the slide's position in the deck (0-based) — pass this through
// to any per-slide UI (e.g. a "N / total" footer) so it matches the slide
// actually being painted, not a hardcoded value.
export type PaintSlideFn<S> = (
  slide: S,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  index: number
) => Promise<void>;

// ─── MIME type selection ────────────────────────────────────────────────────

export function pickSupportedMimeType(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;

  const candidates = [
    { mimeType: 'video/mp4;codecs=h264', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function isVideoExportSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' &&
         typeof HTMLCanvasElement !== 'undefined' &&
         typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
         pickSupportedMimeType() !== null;
}

// ─── Main exporter ──────────────────────────────────────────────────────────

/**
 * Export an array of slides as a video file.
 *
 * @param slides Slides to record
 * @param paintSlide Callback that renders a slide onto the recording canvas.
 *                   Typically uses html2canvas to rasterize a React-rendered
 *                   SlideRenderer component onto the canvas.
 * @param options Recording options
 */
export async function exportSlidesToVideo<S extends AnySlide>(
  slides: S[],
  paintSlide: PaintSlideFn<S>,
  options: VideoExportOptions = {}
): Promise<VideoExportResult> {
  const {
    secondsPerSlide = 3,
    fps = 30,
    width = 1280,
    height = 720,
    onProgress,
    signal,
  } = options;

  if (!isVideoExportSupported()) {
    throw new Error('Video export is not supported in this browser. Try Chrome, Firefox, or Safari 14+.');
  }
  if (slides.length === 0) {
    throw new Error('No slides to export.');
  }

  const mimeInfo = pickSupportedMimeType()!;
  const totalDurationSec = slides.length * secondsPerSlide;

  // ─── Set up the canvas + stream + recorder ──────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D canvas context');

  // Fill with dark background to avoid a black/white flash
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, width, height);

  const stream = canvas.captureStream(fps);

  const recorder = new MediaRecorder(stream, {
    mimeType: mimeInfo.mimeType,
    videoBitsPerSecond: 5_000_000, // 5 Mbps — good quality for 720p
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingComplete = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeInfo.mimeType }));
    recorder.onerror = (e) => reject(new Error('MediaRecorder error: ' + (e as any).error?.message));
  });

  recorder.start();

  try {
    for (let i = 0; i < slides.length; i++) {
      if (signal?.aborted) {
        throw new Error('Export cancelled by user');
      }

      const slide = slides[i];
      onProgress?.(i + 1, slides.length, slide.title);

      // Paint the slide onto the canvas (caller's responsibility)
      await paintSlide(slide, canvas, width, height, i);

      // Hold on this slide for the requested duration
      await new Promise(resolve => setTimeout(resolve, secondsPerSlide * 1000));
    }

    // Give the recorder a moment to capture the last frame
    await new Promise(resolve => setTimeout(resolve, 300));

    recorder.stop();
    stream.getTracks().forEach(t => t.stop());

    const blob = await recordingComplete;

    return {
      blob,
      mimeType: mimeInfo.mimeType,
      extension: mimeInfo.extension,
      durationSeconds: totalDurationSec,
    };
  } catch (error) {
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(t => t.stop());
    throw error;
  }
}

// ─── Helper: trigger browser download of the blob ───────────────────────────

export function downloadVideoBlob(blob: Blob, filename: string, extension: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Helper: paint a DOM element onto a canvas using html2canvas ────────────

/**
 * Render a DOM element onto a canvas using html2canvas at the target resolution.
 * Used by the video exporter's `paintSlide` callback to paint each slide.
 *
 * Letterboxes (preserves aspect ratio with dark bars) if the source element's
 * aspect ratio doesn't match the canvas.
 */
export async function paintElementToCanvas(
  sourceEl: HTMLElement,
  targetCanvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<void> {
  const html2canvasLib = (await import('html2canvas')).default;
  const captured = await html2canvasLib(sourceEl, {
    scale: 1,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#050510',
    logging: false,
    width: sourceEl.offsetWidth,
    height: sourceEl.offsetHeight,
    windowWidth: sourceEl.offsetWidth,
    windowHeight: sourceEl.offsetHeight,
  });

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // Clear + fill background
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, width, height);

  // Letterbox: scale source to fit while preserving aspect ratio
  const sourceAspect = captured.width / captured.height;
  const targetAspect = width / height;
  let drawWidth: number;
  let drawHeight: number;
  let drawX = 0;
  let drawY = 0;

  if (sourceAspect > targetAspect) {
    drawWidth = width;
    drawHeight = width / sourceAspect;
    drawY = (height - drawHeight) / 2;
  } else {
    drawHeight = height;
    drawWidth = height * sourceAspect;
    drawX = (width - drawWidth) / 2;
  }

  ctx.drawImage(captured, drawX, drawY, drawWidth, drawHeight);
}

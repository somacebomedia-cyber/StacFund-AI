import html2canvas from 'html2canvas';

export interface VideoExportOptions {
  secondsPerSlide: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number; // in bps
}

export async function exportDeckToVideo(
  slideElements: HTMLElement[],
  options: VideoExportOptions,
  onProgress: (current: number, total: number, message: string) => void,
  isCancelled: () => boolean
): Promise<Blob> {
  const {
    secondsPerSlide,
    width = 1280,
    height = 720,
    fps = 30,
    bitrate = 5000000 // 5 Mbps
  } = options;

  const totalSlides = slideElements.length;
  onProgress(0, totalSlides, 'Initializing slide capture...');

  // 1. Capture each slide DOM element into an offscreen Image
  const images: HTMLImageElement[] = [];
  for (let i = 0; i < totalSlides; i++) {
    if (isCancelled()) {
      throw new Error('Video generation cancelled by user.');
    }
    
    onProgress(i, totalSlides, `Pre-rendering slide ${i + 1} of ${totalSlides}...`);
    
    const el = slideElements[i];
    // Use html2canvas to render slide
    const canvas = await html2canvas(el, {
      width: el.offsetWidth,
      height: el.offsetHeight,
      scale: width / el.offsetWidth, // scale to output dimensions
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#0a0a1a' // default dark background
    });

    const img = new Image();
    img.src = canvas.toDataURL('image/jpeg', 0.9);
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    images.push(img);
  }

  onProgress(totalSlides, totalSlides, 'Preparing video recording stream...');

  // 2. Set up offscreen recorder canvas
  const recorderCanvas = document.createElement('canvas');
  recorderCanvas.width = width;
  recorderCanvas.height = height;
  const ctx = recorderCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context for recording.');
  }

  // Draw black frame initially
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, width, height);

  // 3. Setup MediaStream and MediaRecorder
  // Try video/webm first (supported in Chrome/Firefox), fall back to video/mp4 (Safari) or standard defaults
  const stream = (recorderCanvas as any).captureStream(fps);
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4'; // Safari fallback
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ''; // Let browser decide
        }
      }
    }
  }

  const chunks: Blob[] = [];
  const recorderOptions = mimeType ? { mimeType, videoBitsPerSecond: bitrate } : { videoBitsPerSecond: bitrate };
  const recorder = new MediaRecorder(stream, recorderOptions);

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  // 4. Perform the recording loop
  return new Promise<Blob>((resolve, reject) => {
    let currentSlideIdx = 0;
    let framesRenderedForCurrentSlide = 0;
    const totalFramesPerSlide = fps * secondsPerSlide;
    let animationFrameId: number;

    recorder.onstop = () => {
      const finalBlob = new Blob(chunks, { type: mimeType || 'video/webm' });
      resolve(finalBlob);
    };

    recorder.onerror = (err) => {
      reject(err);
    };

    // Start recording
    recorder.start();

    function renderLoop() {
      if (isCancelled()) {
        cancelAnimationFrame(animationFrameId);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        reject(new Error('Video generation cancelled by user.'));
        return;
      }

      // 1. Clear frame and draw current slide image
      ctx!.fillStyle = '#0a0a1a';
      ctx!.fillRect(0, 0, width, height);
      
      const currentImg = images[currentSlideIdx];
      if (currentImg) {
        ctx!.drawImage(currentImg, 0, 0, width, height);
      }

      // Add watermark or subtle slide progression indicator
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx!.font = '12px sans-serif';
      ctx!.fillText('StacFund-AI Presenter', 24, height - 24);

      // Simple slide progress bar at the bottom
      const progressPercent = (currentSlideIdx * totalFramesPerSlide + framesRenderedForCurrentSlide) / (totalSlides * totalFramesPerSlide);
      ctx!.fillStyle = '#06b6d4'; // Cyan accent
      ctx!.fillRect(0, height - 4, width * progressPercent, 4);

      // Increment progress
      framesRenderedForCurrentSlide++;
      if (framesRenderedForCurrentSlide >= totalFramesPerSlide) {
        framesRenderedForCurrentSlide = 0;
        currentSlideIdx++;
        if (currentSlideIdx < totalSlides) {
          onProgress(currentSlideIdx, totalSlides, `Recording slide ${currentSlideIdx + 1} of ${totalSlides}...`);
        }
      }

      // If we have rendered all frames for all slides, stop
      if (currentSlideIdx >= totalSlides) {
        onProgress(totalSlides, totalSlides, 'Finalizing video encoding...');
        recorder.stop();
      } else {
        animationFrameId = requestAnimationFrame(renderLoop);
      }
    }

    // Launch loop
    animationFrameId = requestAnimationFrame(renderLoop);
  });
}

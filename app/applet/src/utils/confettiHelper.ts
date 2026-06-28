import confetti from 'canvas-confetti';

export const triggerConfetti = () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);

    let myConfetti: any;
    
    // Handle ESM/CJS interop safely
    if (typeof (confetti as any).create === 'function') {
      myConfetti = (confetti as any).create(canvas, { resize: true, useWorker: true });
    } else if (typeof confetti === 'function') {
      // If confetti itself is the create function
      myConfetti = (confetti as any)(canvas, { resize: true, useWorker: true });
    } else {
      // Fallback
      document.body.removeChild(canvas);
      return;
    }

    myConfetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    }).then(() => {
      if (document.body.contains(canvas)) {
        document.body.removeChild(canvas);
      }
    }).catch(() => {
      if (document.body.contains(canvas)) {
        document.body.removeChild(canvas);
      }
    });
  } catch (error) {
    console.error('Confetti error:', error);
  }
};

import confetti from 'canvas-confetti';

let myConfetti: any = null;

export const triggerConfetti = (options: any = {}) => {
  try {
    if (!myConfetti) {
      if (typeof (confetti as any).create === 'function') {
        myConfetti = (confetti as any).create(null, { resize: true, useWorker: false });
      } else {
        myConfetti = confetti;
      }
    }
    myConfetti(options);
  } catch (error) {
    console.error('Confetti error:', error);
  }
};

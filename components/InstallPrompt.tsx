
import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

    if (isIosDevice && !isStandalone) {
      setIsIOS(true);
      // Show iOS prompt after a small delay
      setTimeout(() => setIsVisible(true), 3000);
    }

    // Capture the PWA install event for Android/Desktop
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[160] p-4 animate-in slide-in-from-bottom duration-500">
      <div className="max-w-md mx-auto bg-[#0a0a1a] border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <button 
          onClick={() => setIsVisible(false)} 
          className="absolute top-2 right-2 p-2 text-gray-500 hover:text-white"
        >
          <X size={16} />
        </button>

        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
             <Download size={24} className="text-white" />
          </div>
          <div>
            <h4 className="font-bold text-white mb-1">Install FundHub App</h4>
            <p className="text-xs text-gray-400 mb-3">
              Add to home screen for quick access, offline mode, and better performance.
            </p>
            
            {isIOS ? (
              <div className="text-xs text-gray-400 bg-white/5 p-3 rounded-lg border border-white/5">
                To install: Tap <Share size={12} className="inline mx-1" /> below, then select <span className="text-white font-bold">"Add to Home Screen"</span>.
              </div>
            ) : (
              <button 
                onClick={handleInstallClick}
                className="bg-white text-black font-black text-xs px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Install Now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;

import React, { useState } from 'react';
import { X, Wand2, Loader2, Download, Image as ImageIcon, Check, RefreshCw } from 'lucide-react';
import { User } from '../types';
import { GoogleGenAI } from '@google/genai';
import { handleGeminiError } from '../services/geminiError';

interface AILogoGeneratorProps {
  user: User | null;
  onClose: () => void;
}

const AILogoGenerator: React.FC<AILogoGeneratorProps> = ({ user, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLogoUrl, setGeneratedLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      
      const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-001',
        prompt: `A professional, clean, modern logo for a business named "${user?.businessName || 'My Business'}". ${prompt}. minimalist, vector style, white background, high quality, corporate identity.`,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/png"
        }
      });

      let foundImage = false;
      const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
      if (base64Image) {
        const imageUrl = `data:image/png;base64,${base64Image}`;
        setGeneratedLogoUrl(imageUrl);
        foundImage = true;
      }

      if (!foundImage) {
        throw new Error("No image generated.");
      }

    } catch (err) {
      
      handleGeminiError(err);
      setError('Failed to generate logo. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2rem] w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
              <Wand2 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">AI Logo Generator</h2>
              <p className="text-sm text-gray-400">Create a professional brand identity</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
          
          {/* Controls */}
          <div className="flex-1 space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Business Name</label>
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium">
                {user?.businessName || 'Your Business'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Describe Your Brand</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A tech company focusing on AI, using blue and purple colors, geometric shapes..."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all h-32 resize-none"
              />
            </div>

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-4 bg-pink-500 hover:bg-pink-400 disabled:bg-white/5 disabled:text-gray-500 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 disabled:shadow-none"
            >
              {isGenerating ? (
                <><Loader2 size={20} className="animate-spin" /> Generating...</>
              ) : (
                <><Wand2 size={20} /> Generate Logo</>
              )}
            </button>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl text-center">
                {error}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full aspect-square max-w-[300px] bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] flex items-center justify-center overflow-hidden relative group">
              {isGenerating ? (
                <div className="flex flex-col items-center text-pink-400">
                  <Loader2 size={40} className="animate-spin mb-4" />
                  <p className="text-sm font-bold animate-pulse">Designing...</p>
                </div>
              ) : generatedLogoUrl ? (
                <>
                  <img src={generatedLogoUrl} alt="Generated Logo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <a 
                      href={generatedLogoUrl} 
                      download="my-logo.png"
                      className="px-6 py-3 bg-white text-black font-black rounded-xl flex items-center gap-2 hover:scale-105 transition-transform"
                    >
                      <Download size={18} /> Download
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center text-gray-600">
                  <ImageIcon size={48} className="mb-4 opacity-50" />
                  <p className="text-sm font-bold">Your Logo Will Appear Here</p>
                </div>
              )}
            </div>
            
            {generatedLogoUrl && !isGenerating && (
              <p className="text-xs text-gray-500 mt-4 text-center">
                Hover over the image to download your new logo. You can upload this in your profile settings.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default AILogoGenerator;

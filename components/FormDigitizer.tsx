
import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, CheckCircle2, AlertTriangle, FileText, ChevronRight, Sparkles, Copy, ScanLine } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { User } from '../types';

interface FormDigitizerProps {
  user: User | null;
  onClose: () => void;
}

interface FormField {
  section: string;
  label: string;
  value: string;
  status: 'filled' | 'missing' | 'uncertain';
  confidence: number;
}

const FormDigitizer: React.FC<FormDigitizerProps> = ({ user, onClose }) => {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'results'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        setImagePreview(base64Data);
        setStep('analyzing');
        await analyzeForm(base64Data);
      };
      
      reader.readAsDataURL(file);
    }
  };

  const analyzeForm = async (base64Image: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      const profileData = localStorage.getItem(`stacfund_profile_${user?.id}`);
      const docsData = localStorage.getItem('stacfund_documents');
      
      // Clean base64 string
      const cleanBase64 = base64Image.split(',')[1];

      const prompt = `
        You are an expert administrative assistant for South African business funding.
        
        CONTEXT:
        User Profile: ${profileData || 'No profile data'}
        Available Documents List: ${docsData || 'No documents'}
        
        TASK:
        1. Analyze the uploaded image of a physical application form.
        2. Identify every visible field or question on this form.
        3. Match the field with the User Profile data to provide the correct answer.
        4. If the data is missing in the profile but can be inferred (e.g. Current Date), do so.
        5. If the data is strictly missing (e.g. Tax Clearance Number not in profile), mark as "missing".
        
        OUTPUT FORMAT:
        Return a strict JSON array of objects.
        Schema:
        [
          {
            "section": "Header/Part A/Part B",
            "label": "Field Name on Form",
            "value": "The value to write",
            "status": "filled" | "missing" | "uncertain"
          }
        ]
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                section: { type: Type.STRING },
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['filled', 'missing', 'uncertain'] }
              }
            }
          }
        }
      });

      const fields = JSON.parse(response.text || '[]');
      setFormFields(fields);
      setStep('results');

    } catch (error) {
      console.error("Analysis failed", error);
      alert("Could not analyze the form. Please ensure the image is clear.");
      setStep('upload');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-5xl h-[90vh] bg-[#0a0a1a] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 hover:bg-white/20 text-white transition-all"
        >
          <X size={24} />
        </button>

        {/* Left Side: Image Preview / Upload */}
        <div className="flex-1 bg-black/50 relative flex flex-col items-center justify-center p-6 border-r border-white/10">
          {step === 'upload' ? (
             <div className="text-center w-full max-w-md space-y-8 animate-in zoom-in-95">
                <div className="w-24 h-24 bg-cyan-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 relative">
                  <ScanLine size={48} className="text-cyan-400" />
                  <div className="absolute inset-0 border-2 border-cyan-500/30 rounded-3xl animate-pulse"></div>
                </div>
                <div>
                  <h2 className="text-3xl font-black mb-2">Digitize Offline Forms</h2>
                  <p className="text-gray-400">Scan physical municipality forms with your camera. AI will auto-fill them using your profile data.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <button 
                     onClick={() => fileInputRef.current?.click()} 
                     className="p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/50 transition-all group"
                   >
                     <Upload size={32} className="mx-auto mb-3 text-gray-400 group-hover:text-white" />
                     <span className="font-bold text-sm">Upload File</span>
                   </button>
                   <label className="p-6 rounded-2xl bg-cyan-500 hover:bg-cyan-400 border border-cyan-500 text-white transition-all group cursor-pointer flex flex-col items-center justify-center">
                     <Camera size={32} className="mx-auto mb-3" />
                     <span className="font-bold text-sm">Scan with Camera</span>
                     <input 
                       type="file" 
                       accept="image/*" 
                       capture="environment"
                       className="hidden" 
                       onChange={handleFileSelect}
                     />
                   </label>
                </div>
                <input 
                   type="file" 
                   accept="image/*,application/pdf" 
                   className="hidden" 
                   ref={fileInputRef}
                   onChange={handleFileSelect}
                />
             </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              {imagePreview && (
                <img 
                  src={imagePreview} 
                  alt="Scanned Form" 
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                />
              )}
              {step === 'analyzing' && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                  <Loader2 size={48} className="text-cyan-400 animate-spin mb-4" />
                  <h3 className="text-xl font-bold animate-pulse">AI is reading the form...</h3>
                  <p className="text-sm text-gray-400">Matching fields to your profile</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Results */}
        {step === 'results' && (
          <div className="flex-1 flex flex-col h-full bg-[#050510] animate-in slide-in-from-right duration-500">
             <div className="p-6 border-b border-white/10 bg-[#0a0a1a]">
               <div className="flex items-center gap-2 mb-2">
                 <div className="px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                   <Sparkles size={10} className="inline mr-1" /> Auto-Fill Ready
                 </div>
                 <div className="px-2 py-1 rounded-md bg-white/5 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                   {formFields.filter(f => f.status === 'filled').length} / {formFields.length} Fields Found
                 </div>
               </div>
               <h3 className="text-2xl font-black">Form Assistant</h3>
               <p className="text-gray-500 text-xs">Transcribe these values onto your physical form.</p>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
               {(Object.entries(formFields.reduce((acc, field) => {
                 (acc[field.section] = acc[field.section] || []).push(field);
                 return acc;
               }, {} as Record<string, FormField[]>)) as [string, FormField[]][]).map(([section, fields]) => (
                 <div key={section} className="animate-in fade-in slide-in-from-bottom-2">
                   <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3 border-b border-white/5 pb-2">{section || 'General Details'}</h4>
                   <div className="space-y-3">
                     {fields.map((field, idx) => (
                       <div key={idx} className="flex items-start gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                         <div className={`mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                           field.status === 'filled' ? 'bg-emerald-500/20 text-emerald-400' : 
                           field.status === 'missing' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                         }`}>
                           {field.status === 'filled' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">{field.label}</p>
                           <p className={`font-medium text-sm truncate ${field.status === 'missing' ? 'text-red-400 italic' : 'text-white'}`}>
                             {field.status === 'missing' ? 'Data missing in profile' : field.value}
                           </p>
                         </div>
                         {field.status === 'filled' && (
                           <button 
                             onClick={() => handleCopy(field.value)}
                             className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                             title="Copy Value"
                           >
                             <Copy size={16} />
                           </button>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
               ))}
             </div>

             <div className="p-6 border-t border-white/10 bg-[#0a0a1a]">
               <button 
                 onClick={() => setStep('upload')}
                 className="w-full py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold border border-white/10 transition-all"
               >
                 Scan Another Page
               </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormDigitizer;

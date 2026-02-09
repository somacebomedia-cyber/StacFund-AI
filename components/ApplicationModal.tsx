
import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, FileText, ChevronRight, Sparkles, Download, Upload, Zap, Lock, ScanLine, Printer } from 'lucide-react';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User, FundingOpportunity, AppDocument } from '../types';

interface ApplicationModalProps {
  user: User | null;
  opportunity: FundingOpportunity;
  onClose: () => void;
  onUpgrade: () => void;
}

const ApplicationModal: React.FC<ApplicationModalProps> = ({ user, opportunity, onClose, onUpgrade }) => {
  const [step, setStep] = useState<'details' | 'upload' | 'generating' | 'review' | 'success'>('details');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState<{title: string, content: string}[]>([]);
  const [uploadedForm, setUploadedForm] = useState<File | null>(null);
  const [missingInfo, setMissingInfo] = useState<string[]>([]);
  
  const isPaid = user?.subscriptionPlan !== 'free';

  const handleStartApplication = () => {
      setStep('upload');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setUploadedForm(e.target.files[0]);
          // In a real app, we would process the file here
      }
  };

  const generateApplicationPackage = async () => {
    if (!user) return;
    setIsGenerating(true);
    setStep('generating');

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Fetch user profile from local storage (or Firestore in a real scenario to be safe)
      const userProfile = localStorage.getItem(`fundhub_profile_${user.id}`);
      const profileData = userProfile ? JSON.parse(userProfile) : {};

      const prompt = `
        Act as an expert business consultant. Create a comprehensive application package for the funding opportunity: "${opportunity.title}" provided by "${opportunity.provider}".
        
        Using this Business Profile:
        ${JSON.stringify(profileData)}

        Generate the following 3 documents in full detail:
        1. A Cover Letter addressed to the provider.
        2. A Business Plan Executive Summary tailored to this opportunity.
        3. A Project Proposal outlining how the funds (${opportunity.range}) will be used.

        Return a JSON array of objects with "title" and "content" (markdown supported) fields.
        Do not include markdown code fences (like \`\`\`json) in your response.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      // More robust cleanup
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Attempt to find the array start and end if there's extra text
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
          text = text.substring(firstBracket, lastBracket + 1);
      }

      // Handle potential trailing comma which is invalid JSON
      text = text.replace(/,(\s*])/, '$1');
      // Escape potential unescaped newlines in strings which is invalid JSON
      // This is tricky, a safer way is to rely on the model instructions or use a safer parser.
      // But for now, let's try to trust the cleaned text.

      try {
        const docs = JSON.parse(text);
        setGeneratedDocs(docs);
        setStep('review');

        // Save application record
        await addDoc(collection(db, 'users', user.id, 'applications'), {
            opportunityId: opportunity.id || 'gen',
            opportunityTitle: opportunity.title,
            provider: opportunity.provider,
            status: 'DRAFT', // Should be SUBMITTED if we actually sent it
            date: new Date().toISOString(),
            type: 'GRANT' // Simplified
        });
      } catch (parseError) {
         console.error("JSON Parse Error:", parseError, "Text was:", text);
         alert("AI generated invalid data. Please try again.");
         setStep('details');
         return; // Exit early
      }

    } catch (error) {
      console.error("Generation failed", error);
      alert("Failed to generate application. Please try again.");
      setStep('details');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPackage = () => {
      // Create a simple text file download for the MVP
      const content = generatedDocs.map(d => `--- ${d.title} ---\n\n${d.content}\n\n`).join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${opportunity.title.replace(/\s+/g, '_')}_Application_Package.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStep('success');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#0a0a1a] w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
              <h2 className="text-xl font-black">{opportunity.title}</h2>
              <p className="text-sm text-gray-400">{opportunity.provider}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {step === 'details' && (
                <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-start gap-3">
                        <Sparkles className="shrink-0 mt-1" size={18} />
                        <div>
                            <h4 className="font-bold text-sm">AI Application Assistant</h4>
                            <p className="text-xs opacity-80">I can auto-generate your business plan, proposal, and cover letter for this application.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-lg text-white">About this Opportunity</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{opportunity.description}</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-white/5 rounded-xl">
                                <p className="text-xs text-gray-500 font-bold uppercase">Amount</p>
                                <p className="font-medium text-white">{opportunity.range}</p>
                            </div>
                            <div className="p-3 bg-white/5 rounded-xl">
                                <p className="text-xs text-gray-500 font-bold uppercase">Deadline</p>
                                <p className="font-medium text-white">{opportunity.deadline || 'Open'}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                             {opportunity.tags?.map(t => <span key={t} className="px-2 py-1 bg-white/5 text-gray-400 text-xs rounded-lg font-bold uppercase">{t}</span>)}
                        </div>
                    </div>
                </div>
            )}

            {step === 'upload' && (
                <div className="space-y-8 text-center py-8">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload size={32} className="text-gray-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold mb-2">Have an application form?</h3>
                        <p className="text-gray-400 text-sm max-w-sm mx-auto">Upload the PDF or Image of the application form, and our AI will fill it out for you.</p>
                    </div>

                    <div className="flex justify-center gap-4">
                        <label className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl cursor-pointer font-bold text-sm transition-all">
                            Upload Form
                            <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
                        </label>
                        <button onClick={generateApplicationPackage} className="px-6 py-3 bg-white/5 text-gray-400 hover:text-white rounded-xl font-bold text-sm transition-all">
                            Skip / No Form
                        </button>
                    </div>
                    {uploadedForm && (
                        <div className="text-sm text-cyan-400 font-bold flex items-center justify-center gap-2">
                            <CheckCircle2 size={16} /> {uploadedForm.name} uploaded
                        </div>
                    )}
                </div>
            )}

            {step === 'generating' && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Loader2 size={48} className="text-cyan-400 animate-spin mb-6" />
                    <h3 className="text-xl font-bold mb-2">Generating Documents...</h3>
                    <p className="text-gray-400 text-sm max-w-xs">AI is writing your business plan, proposal, and cover letter based on your profile.</p>
                </div>
            )}

            {step === 'review' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                         <h3 className="text-lg font-bold">Application Package Ready</h3>
                         <span className="text-xs font-bold bg-green-500/10 text-green-400 px-2 py-1 rounded-md">3 Documents</span>
                    </div>

                    <div className="space-y-3">
                        {generatedDocs.map((doc, i) => (
                            <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all group cursor-pointer">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                                            <FileText size={16} />
                                        </div>
                                        <h4 className="font-bold text-sm">{doc.title}</h4>
                                    </div>
                                    <span className="text-xs text-gray-500 group-hover:text-cyan-400">View</span>
                                </div>
                                <p className="text-xs text-gray-500 line-clamp-2 pl-11">{doc.content}</p>
                            </div>
                        ))}
                    </div>
                    
                    {!isPaid && (
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3">
                            <Lock className="text-amber-400 shrink-0" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-amber-400">Premium Feature</h4>
                                <p className="text-xs text-amber-400/80 mt-1">Upgrade to "Founder Pro" to export these documents as formatted PDFs with your branding.</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {step === 'success' && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Good Luck!</h3>
                    <p className="text-gray-400 text-sm max-w-xs mb-6">Your application package has been downloaded. You can now submit it to the provider.</p>
                    <button onClick={onClose} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm">Close</button>
                </div>
            )}
        </div>

        <div className="p-6 border-t border-white/10 bg-[#0a0a1a]">
            {step === 'details' && (
                <button 
                    onClick={handleStartApplication}
                    className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                >
                    <Zap size={18} /> Start Application
                </button>
            )}
            
            {step === 'upload' && uploadedForm && (
                <button 
                    onClick={generateApplicationPackage}
                    className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                    <Sparkles size={18} /> Auto-Fill & Generate
                </button>
            )}
            
             {step === 'upload' && !uploadedForm && (
                <button 
                    onClick={generateApplicationPackage}
                    className="w-full py-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-black rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                    <Sparkles size={18} /> Generate Without Form
                </button>
            )}

            {step === 'review' && (
                <div className="flex gap-4">
                     <button onClick={() => setStep('details')} className="px-6 py-4 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-gray-400">Back</button>
                     <button 
                        onClick={handleDownloadPackage}
                        className="flex-1 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all"
                    >
                        <Download size={18} /> Download Package
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationModal;
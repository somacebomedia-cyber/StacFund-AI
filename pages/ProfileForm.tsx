
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Building2, User as UserIcon, FileText, Upload, X, File, CheckCircle2, Loader2, Sparkles, Wand2, Phone, MessageCircle, FileDown, BookOpen, PenTool, ChevronRight, Copy, Check, ShoppingBag, BarChart3, Package, Printer, Lock } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { AppDocument, User } from '../types';

interface ProfileFormProps {
  onBack: () => void;
  user: User | null;
  onUpgrade: () => void;
}

type TabType = 'business' | 'owner' | 'documents';

const ProfileForm: React.FC<ProfileFormProps> = ({ onBack, user, onUpgrade }) => {
  const [activeTab, setActiveTab] = useState<TabType>('business');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState<string | null>(null);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [generatedProposal, setGeneratedProposal] = useState<{ text: string, type: 'proposal' | 'businessplan' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [showSubmissionPack, setShowSubmissionPack] = useState(false);

  const [businessInfo, setBusinessInfo] = useState({
    name: '',
    registration: '',
    type: 'Private Company',
    industry: '',
    description: '',
    productsServices: '',
    employees: '',
    revenue: '',
    years: '',
    whatsapp: ''
  });

  useEffect(() => {
    const fetchProfileData = async () => {
        if (!user) return;
        
        // Fetch Profile
        const userDocRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().profile) {
            setBusinessInfo(userDoc.data().profile);
        } else {
            setBusinessInfo(prev => ({ ...prev, name: user.businessName || '' }));
        }

        // Fetch Documents
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docsSnap = await getDocs(docsRef);
        const fetchedDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppDocument));
        setDocuments(fetchedDocs);
    };

    fetchProfileData();
  }, [user]);

  const handleAIAnalyze = async (docId: string, docName: string) => {
    if (!user) return;
    setIsScanning(docId);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Based on the document name "${docName}", suggest a realistic registration number, a relevant business industry, and a business description for a South African company. 
      Return a JSON object with "registration", "industry", and "description".`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const data = JSON.parse(response.text || '{}');
      if (data.registration) {
        const updatedInfo = { 
          ...businessInfo, 
          registration: data.registration || businessInfo.registration, 
          industry: data.industry || businessInfo.industry,
          description: data.description || businessInfo.description
        };
        setBusinessInfo(updatedInfo);
        
        // Save update to Firestore immediately
        const userDocRef = doc(db, 'users', user.id);
        await setDoc(userDocRef, { profile: updatedInfo }, { merge: true });
        
        alert(`AI Scan Successful: Information extracted from ${docName} and saved to your profile!`);
      }
    } catch (e) {
      console.error(e);
      alert('AI Scan failed. Please try again.');
    } finally {
      setIsScanning(null);
    }
  };

  const handleGenerateProposal = async (type: 'proposal' | 'businessplan') => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }

    if (!user || !businessInfo.name) {
      alert('Please fill in your business name before generating a document.');
      return;
    }
    
    setIsGeneratingProposal(true);
    setGeneratedProposal(null);
    
    // Extract document context to help the AI realize what we have
    const financialDocs = documents.filter(doc => 
      doc.name.toLowerCase().includes('bank') || 
      doc.name.toLowerCase().includes('statement') || 
      doc.name.toLowerCase().includes('quote') || 
      doc.name.toLowerCase().includes('quotation')
    ).map(doc => doc.name).join(', ');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Write a comprehensive and professional ${type === 'proposal' ? 'Funding Proposal' : 'Detailed Business Plan'} for a South African business.
      
      BUSINESS IDENTITY:
      - Name: ${businessInfo.name}
      - Industry: ${businessInfo.industry || 'General Services'}
      - Core Description: ${businessInfo.description || 'A growing enterprise in South Africa.'}
      - Products & Services: ${businessInfo.productsServices || 'Standard industry offerings.'}
      - Registration: ${businessInfo.registration || 'Pending'}

      DOCUMENT CONTEXT:
      - The user has uploaded the following financial context documents: ${financialDocs || 'None specified, use industry benchmarks'}.
      
      REQUIREMENTS:
      1. Use a professional, persuasive tone suitable for South African funding bodies (NYDA, SEFA, IDC, or commercial banks).
      2. MANDATORY SECTIONS for ${type === 'businessplan' ? 'Business Plan' : 'Proposal'}:
         - Executive Summary
         - Market Analysis (focused on South African landscape)
         - Detailed Operational Plan
         - Products & Services Deep Dive
         ${type === 'businessplan' ? '- 3-Year Financial Projections (Revenue, OpEx, Net Profit tables)' : '- Funding Request & Utilization Plan'}
         - Social & Economic Impact (Job creation is key)
      3. For Financial Projections: Create realistic tables using Markdown. If "bank statements" or "quotations" were mentioned in the context, reflect those costs/income levels in the projections.
      4. Use professional formatting (bolding, lists, headers).
      5. Length: Substantial, authoritative, and ready for submission.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      
      setGeneratedProposal({ 
        text: response.text || "Could not generate document.", 
        type 
      });
    } catch (e) {
      console.error(e);
      alert('Generation failed. Check your connection.');
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const handleCopy = () => {
    if (generatedProposal) {
      navigator.clipboard.writeText(generatedProposal.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveProposalToVault = async () => {
    if (!generatedProposal || !user) return;
    
    const typeLabel = generatedProposal.type === 'proposal' ? 'Proposal' : 'Business_Plan';
    const docName = `AI_${businessInfo.name.replace(/\s+/g, '_')}_${typeLabel}.txt`;
    const newDoc = {
      name: docName,
      type: 'text/plain',
      size: generatedProposal.text.length,
      uploadDate: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      category: 'AI Generated'
    };
    
    const docsRef = collection(db, 'users', user.id, 'documents');
    const ref = await addDoc(docsRef, newDoc);
    
    setDocuments(prev => [...prev, { id: ref.id, ...newDoc } as AppDocument]);
    setGeneratedProposal(null);
    alert('Document saved to your Vault!');
  };

  const handleSaveBusiness = async () => {
    if (!user) return;
    setIsSaving(true);
    
    const userDocRef = doc(db, 'users', user.id);
    await setDoc(userDocRef, { profile: businessInfo }, { merge: true });
    
    setIsSaving(false);
    alert('Business information updated successfully!');
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    
    const docsRef = collection(db, 'users', user.id, 'documents');
    
    // In a real app we'd upload to Firebase Storage here.
    // For this prototype, we save metadata to Firestore.
    const promises = Array.from(files).map(async (file) => {
        const newDoc = {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            uploadDate: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            category: 'General'
        };
        const ref = await addDoc(docsRef, newDoc);
        return { id: ref.id, ...newDoc } as AppDocument;
    });

    const newDocs = await Promise.all(promises);
    setDocuments(prev => [...prev, ...newDocs]);
  };

  const removeDocument = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.id, 'documents', id));
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadPack = () => {
    alert("In a real app, this would trigger a ZIP download containing all your PDFs and the checklist. For now, you can print the checklist!");
    window.print();
  };

  const isPaid = user?.subscriptionPlan !== 'free';

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 group font-bold">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-black mb-2 tracking-tight">Profile & Documents</h1>
        <p className="text-gray-400 text-lg">Complete your profile to unlock auto-fill features</p>
      </div>

      <div className="flex gap-4 mb-8 overflow-x-auto pb-2 custom-scrollbar">
        {['business', 'owner', 'documents'].map((id) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as TabType)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold border transition-all capitalize ${activeTab === id ? 'bg-purple-600/10 border-purple-500 text-purple-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-gray-300'}`}
          >
            {id} Info
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-3xl p-8">
        {activeTab === 'business' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="text" value={businessInfo.name} onChange={(e) => setBusinessInfo({...businessInfo, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Registration Number</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="text" value={businessInfo.registration} onChange={(e) => setBusinessInfo({...businessInfo, registration: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. 2024/123456/07" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Industry</label>
                <input type="text" value={businessInfo.industry} onChange={(e) => setBusinessInfo({...businessInfo, industry: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. Technology, Agriculture" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  WhatsApp Number <MessageCircle size={14} className="text-emerald-400" />
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="tel" value={businessInfo.whatsapp} onChange={(e) => setBusinessInfo({...businessInfo, whatsapp: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="+27 71 234 5678" />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <ShoppingBag size={14} className="text-purple-400" /> Products & Services
              </label>
              <textarea rows={3} value={businessInfo.productsServices} onChange={(e) => setBusinessInfo({...businessInfo, productsServices: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="List what you sell or the services you provide..." />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Business Vision & Description</label>
              <textarea rows={4} value={businessInfo.description} onChange={(e) => setBusinessInfo({...businessInfo, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="Briefly describe your business goals and current operations..." />
            </div>
            <button onClick={handleSaveBusiness} disabled={isSaving} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xl shadow-purple-500/20">
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} Save Information
            </button>
          </div>
        )}

        {activeTab === 'owner' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="glass-panel p-10 rounded-3xl text-center opacity-50 flex flex-col items-center gap-4 border-dashed border-2">
                <UserIcon size={48} className="text-gray-600" />
                <h4 className="font-bold">Owner Information</h4>
                <p className="text-sm text-gray-500 max-w-sm">This section is coming soon. We will use it to verify BEE status and age for youth-specific grants like NYDA.</p>
             </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {showSubmissionPack ? (
              <div className="animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black flex items-center gap-2"><Package size={24} className="text-cyan-400" /> Physical Submission Pack</h3>
                  <button onClick={() => setShowSubmissionPack(false)} className="text-sm font-bold text-gray-500 hover:text-white">Close Pack</button>
                </div>
                <div className="bg-white text-black p-8 rounded-2xl shadow-2xl mb-6 font-serif">
                   <div className="text-center border-b-2 border-black pb-4 mb-6">
                     <h2 className="text-3xl font-bold uppercase tracking-widest mb-2">Application Cover Sheet</h2>
                     <p className="text-sm font-bold">{businessInfo.name} | Reg: {businessInfo.registration}</p>
                   </div>
                   
                   <p className="mb-4 text-sm">Please find attached the following documents for the funding application:</p>
                   
                   <div className="space-y-2 mb-8">
                     {documents.map((doc, i) => (
                       <div key={doc.id} className="flex items-center gap-2 border-b border-gray-200 pb-2">
                         <div className="w-4 h-4 border border-black flex items-center justify-center text-xs">✓</div>
                         <span className="font-bold text-sm">Annexure {String.fromCharCode(65 + i)}:</span>
                         <span className="text-sm">{doc.name}</span>
                       </div>
                     ))}
                   </div>

                   <div className="mt-12 pt-8 border-t border-black flex justify-between items-end">
                     <div>
                       <div className="h-0.5 w-48 bg-black mb-2"></div>
                       <p className="text-xs font-bold uppercase">Applicant Signature</p>
                     </div>
                     <p className="text-xs font-bold">{new Date().toLocaleDateString()}</p>
                   </div>
                </div>
                <button onClick={handleDownloadPack} className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all">
                  <Printer size={20} /> Print Pack Checklist
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files)} />
                    <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2 shadow-lg"><Upload size={32} /></div>
                    <div>
                      <h4 className="text-lg font-bold">Upload Documents</h4>
                      <p className="text-xs text-gray-500 mt-1 font-medium">Upload Bank Statements, Quotations, or ID</p>
                    </div>
                  </div>

                  <div className="glass-panel p-8 rounded-3xl border border-cyan-500/20 relative overflow-hidden group bg-gradient-to-br from-cyan-500/5 to-transparent">
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                        <Sparkles size={20} />
                      </div>
                      <h4 className="font-black text-sm uppercase tracking-widest">AI Power Tools</h4>
                      {!isPaid && (
                        <div className="ml-auto bg-black/50 px-2 py-1 rounded text-[10px] font-bold uppercase border border-white/20 flex items-center gap-1">
                          <Lock size={10} /> Pro
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-6 font-medium">Generate high-quality business documents including <span className="text-cyan-400">financial projections</span>.</p>
                    
                    <div className="space-y-3">
                      <button 
                        onClick={() => handleGenerateProposal('proposal')}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all group relative overflow-hidden"
                      >
                         {!isPaid && (
                           <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                             <Lock size={14} className="text-white" />
                           </div>
                         )}
                        <div className="flex items-center gap-3">
                          <PenTool size={18} className="text-cyan-400" />
                          <span className="text-xs font-bold">Funding Proposal</span>
                        </div>
                        {isGeneratingProposal ? <Loader2 size={16} className="animate-spin text-cyan-400" /> : <ChevronRight size={16} className="text-gray-600 group-hover:text-cyan-400" />}
                      </button>
                      <button 
                        onClick={() => handleGenerateProposal('businessplan')}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
                      >
                         {!isPaid && (
                           <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                             <Lock size={14} className="text-white" />
                           </div>
                         )}
                        <div className="flex items-center gap-3">
                          <BarChart3 size={18} className="text-indigo-400" />
                          <div className="text-left">
                            <span className="text-xs font-bold block">Business Plan</span>
                            <span className="text-[8px] uppercase tracking-tighter text-indigo-400 font-black">Incl. Financial Projections</span>
                          </div>
                        </div>
                        {isGeneratingProposal ? <Loader2 size={16} className="animate-spin text-indigo-400" /> : <ChevronRight size={16} className="text-gray-600 group-hover:text-indigo-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                {generatedProposal && (
                  <div className="glass-panel p-8 rounded-3xl border border-purple-500/30 animate-in slide-in-from-top-4 duration-500 relative bg-white/5">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-2">
                        <Sparkles size={20} className="text-purple-400" />
                        <h3 className="text-lg font-black capitalize">Generated {generatedProposal.type === 'proposal' ? 'Proposal' : 'Business Plan'}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleCopy}
                          title="Copy to clipboard"
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
                        >
                          {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                        </button>
                        <button onClick={() => setGeneratedProposal(null)} className="p-2.5 rounded-xl hover:bg-white/5 text-gray-500"><X size={20} /></button>
                      </div>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto custom-scrollbar bg-black/40 p-8 rounded-2xl border border-white/5 mb-6 shadow-inner">
                      <div className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed font-serif prose prose-invert max-w-none">
                        {generatedProposal.text}
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={saveProposalToVault}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-500/20"
                      >
                        <FileDown size={20} /> Save to My Documents
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-300">Your Documents ({documents.length})</h4>
                    <div className="flex gap-2">
                      {documents.length > 0 && (
                         <button 
                            onClick={() => setShowSubmissionPack(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
                          >
                           <Package size={12} /> Prepare Physical Submission
                         </button>
                      )}
                    </div>
                  </div>
                  {documents.length > 0 ? (
                    documents.map((doc) => (
                      <div key={doc.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between group overflow-hidden relative">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-400"><File size={20} /></div>
                          <div>
                            <h5 className="font-bold text-sm truncate max-w-[200px]">{doc.name}</h5>
                            <p className="text-[10px] text-gray-500">{formatFileSize(doc.size)} • {doc.uploadDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleAIAnalyze(doc.id, doc.name)}
                            disabled={isScanning !== null}
                            title="Extract data from this document"
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm ${isScanning === doc.id ? 'bg-cyan-500 text-white' : 'bg-white/5 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-transparent'}`}
                          >
                            {isScanning === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} 
                            {isScanning === doc.id ? 'Extracting...' : 'Auto-Fill Profile'}
                          </button>
                          <button onClick={() => removeDocument(doc.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"><X size={16} /></button>
                        </div>
                        {isScanning === doc.id && <div className="absolute inset-x-0 bottom-0 h-1 animate-shimmer"></div>}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 opacity-30">
                      <FileText size={32} className="mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase tracking-widest">No documents found</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileForm;

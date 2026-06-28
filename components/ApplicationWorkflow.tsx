import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, FileText, Download, Loader2, ArrowRight, ArrowLeft, FileSignature, Briefcase, ShieldCheck, FileCheck, Upload, Wand2, Sparkles, Building, Hash, Phone, Banknote, HelpCircle, Check, Send, Zap } from 'lucide-react';
import { FundingOpportunityDb, User, ApplicationStatus, AppDocument } from '../types';
import { GoogleGenAI } from '@google/genai';
import { handleGeminiError } from '../services/geminiError';
import { db } from '../services/firebase';
import { addDoc, collection, updateDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/firebase';
import { triggerConfetti } from '../utils/confettiHelper';
import GammaPitchLayout from './templates/GammaPitchLayout';

interface ApplicationWorkflowProps {
  opportunity: FundingOpportunityDb;
  user: User;
  onClose: () => void;
  onComplete: () => void;
}

const steps = [
  { num: 1, label: 'Application Form', description: 'Basic details required', icon: FileSignature },
  { num: 2, label: 'Business Plan', description: 'AI-generated proposal', icon: Briefcase },
  { num: 3, label: 'Compliance Docs', description: 'Select attached files', icon: ShieldCheck },
  { num: 4, label: 'Submit Application', description: 'Choose your route', icon: Send }
];

const ApplicationWorkflow: React.FC<ApplicationWorkflowProps> = ({ opportunity, user, onClose, onComplete }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [businessPlan, setBusinessPlan] = useState('');
  const [userDocs, setUserDocs] = useState<AppDocument[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [includeAppForm, setIncludeAppForm] = useState(true);
  const [includeBusinessPlan, setIncludeBusinessPlan] = useState(true);
  
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);
  const [directSubmitStatus, setDirectSubmitStatus] = useState('');
  
  const [previewData, setPreviewData] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    businessName: user.businessName || '',
    registrationNumber: '',
    fundingRequested: '',
    purpose: '',
    contactName: '',
    contactEmail: user.email || '',
    contactPhone: user.whatsapp || ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userDocRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().profile) {
          const parsed = userDoc.data().profile;
          setFormData(prev => ({
            ...prev,
            registrationNumber: parsed.registration || '',
            businessName: parsed.name || prev.businessName
          }));
        }
      } catch (e) {
        console.error('Error fetching profile data', e);
      }
    };
    fetchProfile();

    const fetchDocs = async () => {
      try {
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docSnapshot = await getDocs(docsRef);
        const fetchedDocs = docSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppDocument));
        setUserDocs(fetchedDocs);
        // Pre-select some common doc types if available
        const cipc = fetchedDocs.find(d => d.category === 'CIPC Registration');
        const tax = fetchedDocs.find(d => d.category === 'Tax Clearance');
        const ids = [];
        if (cipc) ids.push(cipc.id);
        if (tax) ids.push(tax.id);
        setSelectedDocs(ids);
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };
    fetchDocs();
  }, [user.id]);

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    try {
      const userDocRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userDocRef);
      let parsed: any = {};
      if (userDoc.exists() && userDoc.data().profile) {
        parsed = userDoc.data().profile;
      }
      
      setFormData(prev => ({
        ...prev,
        businessName: parsed.name || user.businessName || prev.businessName,
        registrationNumber: parsed.registration || prev.registrationNumber,
        contactEmail: user.email || prev.contactEmail,
        contactPhone: user.whatsapp || prev.contactPhone,
      }));
    } catch (error) {
      console.error('Error auto-filling from profile', error);
    }
    
    setTimeout(() => setIsAutoFilling(false), 800);
  };

  const generateBusinessPlan = async () => {
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      const prompt = `Generate flawless JSON for ${formData.businessName}. Schema: { "executiveSummary": "string", "financialPlan": { "fundingRequirement": "R48,996", "useOfFunds": [{"category": "Printers", "amount": "R3,999"}] }, "conclusion": "string" }`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const parsed = JSON.parse(response.text || '{}');
      setBusinessPlan(parsed);
      
      // AUTO-OPEN GAMMA VISUAL PITCH DECK FIRST
      setPreviewData(parsed);
      setIsPreviewOpen(true);
      
      setStep(3);
    } catch (error) {
      
      handleGeminiError(error);
      alert('Failed to generate business plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const saveDraft = async () => {
    if (!formData.businessName) return;

    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.opportunity_id));

    let logoUrl = '';
    if (opportunity.logo_url) {
      logoUrl = opportunity.logo_url;
    } else if (opportunity.source_url) {
      try {
        logoUrl = `https://logo.clearbit.com/${new URL(opportunity.source_url).hostname}`;
      } catch (e) {
        console.warn('Error parsing source_url for clearbit logo:', e);
      }
    }

    const draftData = {
      opportunityId: opportunity.opportunity_id,
      opportunityTitle: opportunity.programme_name,
      provider: opportunity.issuer_name,
      logoUrl,
      status: ApplicationStatus.DRAFT,
      date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      type: opportunity.funding_type,
    };

    try {
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0];
        // Only write if still a draft — never downgrade a submitted app
        if (existingDoc.data().status === ApplicationStatus.DRAFT) {
          await updateDoc(
            doc(db, 'users', user.id, 'applications', existingDoc.id),
            draftData
          );
        }
      } else {
        await addDoc(appsRef, draftData);
      }

      // Mirror to localStorage
      const stored = JSON.parse(localStorage.getItem('stacfund_applications') || '[]');
      const idx = stored.findIndex(
        (a: any) => a.opportunityId === opportunity.opportunity_id && a.userId === user.id
      );
      if (idx >= 0) {
        if (stored[idx].status === ApplicationStatus.DRAFT) {
          stored[idx] = { ...stored[idx], ...draftData };
        }
      } else {
        stored.push({
          ...draftData,
          id: Math.random().toString(36).substr(2, 9),
          userId: user.id,
        });
      }
      localStorage.setItem('stacfund_applications', JSON.stringify(stored));

    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  const handleDirectSubmit = async () => {
    setIsDirectSubmitting(true);
    setDirectSubmitStatus(`Establishing secure connection...`);
    await new Promise(r => setTimeout(r, 1200));
    setDirectSubmitStatus(`Connecting to ${opportunity.issuer_name}...`);
    await new Promise(r => setTimeout(r, 1200));
    setDirectSubmitStatus('Encrypting submission pack...');
    await new Promise(r => setTimeout(r, 1200));
    setDirectSubmitStatus('Transmitting business profile and documents...');
    await new Promise(r => setTimeout(r, 1500));
    setDirectSubmitStatus('Awaiting institution receipt confirmation...');
    await new Promise(r => setTimeout(r, 1500));
    setDirectSubmitStatus('Application Received.');
    await new Promise(r => setTimeout(r, 800));
    
    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.opportunity_id));
    
    try {
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const appDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', user.id, 'applications', appDoc.id), {
          status: ApplicationStatus.SUBMITTED,
          submissionMethod: 'DIRECT_API',
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          submissionMethod: 'DIRECT_API',
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        await addDoc(appsRef, newApplication);
      }
      
      const applications = JSON.parse(localStorage.getItem('stacfund_applications') || '[]');
      const existingIndex = applications.findIndex((a: any) => a.opportunityId === opportunity.opportunity_id && a.userId === user.id);
      
      if (existingIndex >= 0) {
        applications[existingIndex].status = ApplicationStatus.SUBMITTED;
        applications[existingIndex].submissionMethod = 'DIRECT_API';
        applications[existingIndex].date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        localStorage.setItem('stacfund_applications', JSON.stringify(applications));
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          submissionMethod: 'DIRECT_API',
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        localStorage.setItem('stacfund_applications', JSON.stringify([...applications, { ...newApplication, id: Math.random().toString(36).substr(2, 9), userId: user.id }]));
      }
      
      setIsDirectSubmitting(false);
      triggerConfetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#A855F7', '#10B981', '#3B82F6', '#F59E0B']
      });
      onComplete();
    } catch (error) {
      setIsDirectSubmitting(false);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  const handleDownloadPack = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.opportunity_id));
    
    try {
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const appDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', user.id, 'applications', appDoc.id), {
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        await addDoc(appsRef, newApplication);
      }
      
      const applications = JSON.parse(localStorage.getItem('stacfund_applications') || '[]');
      const existingIndex = applications.findIndex((a: any) => a.opportunityId === opportunity.opportunity_id && a.userId === user.id);
      
      if (existingIndex >= 0) {
        applications[existingIndex].status = ApplicationStatus.SUBMITTED;
        applications[existingIndex].date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        localStorage.setItem('stacfund_applications', JSON.stringify(applications));
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        localStorage.setItem('stacfund_applications', JSON.stringify([...applications, { ...newApplication, id: Math.random().toString(36).substr(2, 9), userId: user.id }]));
      }
      
      setIsLoading(false);
      triggerConfetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#A855F7', '#10B981', '#3B82F6', '#F59E0B']
      });
      onComplete();
    } catch (error) {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      {isPreviewOpen && <GammaPitchLayout data={previewData} businessInfo={formData} onClose={() => setIsPreviewOpen(false)} />}
      
      <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2rem] w-full max-w-5xl h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Sidebar Flow Diagram */}
        <div className="hidden md:flex flex-col w-[300px] border-r border-white/5 bg-gradient-to-b from-white/5 to-transparent p-8">
          <button onClick={onClose} className="self-start p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors mb-12">
            <X size={20} />
          </button>
          
          <div className="mb-12">
            <h2 className="text-xl font-black text-white mb-2 leading-tight">Apply for<br/><span className="text-purple-400">{opportunity.programme_name}</span></h2>
            <p className="text-xs text-gray-500 uppercase tracking-widest">{opportunity.issuer_name}</p>
          </div>

          <div className="flex-1 relative space-y-12">
            <div className="absolute left-[19px] top-6 bottom-8 w-0.5 bg-gradient-to-b from-purple-500/50 via-white/5 to-transparent"></div>
            
            {steps.map((s, i) => {
              const isCurrent = step === s.num;
              const isPast = step > s.num;
              
              return (
                <div key={s.num} className="relative flex items-start gap-4">
                  <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-xl z-10 transition-all duration-500 ${
                    isCurrent ? 'bg-purple-500 text-white shadow-purple-500/30 scale-110' : 
                    isPast ? 'bg-white text-black' : 'bg-black border-2 border-white/10 text-gray-600'
                  }`}>
                    {isPast ? <Check size={18} /> : <s.icon size={18} />}
                  </div>
                  <div className={`transition-all duration-300 ${isCurrent ? 'opacity-100' : 'opacity-40'}`}>
                    <h4 className={`text-sm font-black uppercase tracking-wider mb-1 ${isCurrent ? 'text-white' : 'text-gray-300'}`}>Step {s.num}</h4>
                    <p className={`text-sm font-bold ${isCurrent ? 'text-purple-300' : 'text-gray-500'}`}>{s.label}</p>
                    <p className="text-xs text-gray-600 mt-1">{s.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <h2 className="text-base font-black text-white truncate max-w-[200px]">{opportunity.programme_name}</h2>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Step {step} of 4</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-br from-[#0a0a1a] to-[#12122b]">
          
          <div className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar relative z-10">
            {/* STEP 1: Form */}
            {step === 1 && (
              <div className="max-w-2xl mx-auto animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                       <FileSignature className="text-purple-400" /> Basic Details
                    </h3>
                    <p className="text-gray-400 text-sm">Please provide the core information for your application.</p>
                  </div>
                  <button 
                    onClick={handleAutoFill}
                    disabled={isAutoFilling}
                    className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 px-4 font-bold text-neutral-50 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
                  >
                    <span className="mr-2 flex items-center justify-center">
                      {isAutoFilling ? <CheckCircle2 size={16} /> : <Sparkles size={16} className="text-purple-200 group-hover:text-white transition-colors" />}
                    </span>
                    <span className="text-sm">{isAutoFilling ? 'Auto-filled!' : 'Auto-fill'}</span>
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Building size={14} className="text-gray-600" /> Business Name
                      </label>
                      <input type="text" value={formData.businessName} onChange={e => setFormData({...formData, businessName: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Hash size={14} className="text-gray-600" /> Reg Number (optional)
                      </label>
                      <input type="text" value={formData.registrationNumber} onChange={e => setFormData({...formData, registrationNumber: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Banknote size={14} className="text-gray-600" /> Funding Requested
                      </label>
                      <input type="text" placeholder="e.g. R500,000" value={formData.fundingRequested} onChange={e => setFormData({...formData, fundingRequested: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-emerald-400 font-bold focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-emerald-900/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Phone size={14} className="text-gray-600" /> Contact Phone
                      </label>
                      <input type="text" value={formData.contactPhone} onChange={e => setFormData({...formData, contactPhone: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium" />
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <HelpCircle size={14} className="text-gray-600" /> Purpose of Funding
                    </label>
                    <textarea rows={4} placeholder="Briefly describe how you will use the funds to grow or sustain your business..." value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none font-medium text-sm leading-relaxed"></textarea>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Proposal Generation */}
            {step === 2 && (
              <div className="max-w-2xl mx-auto h-full flex items-center justify-center animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="text-center w-full">
                  <div className="relative w-32 h-32 mx-auto mb-8">
                    <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full animate-pulse"></div>
                    <div className="relative bg-gradient-to-b from-purple-500/10 to-transparent border border-purple-500/20 w-full h-full rounded-full flex items-center justify-center">
                      <Wand2 size={48} className="text-purple-400" />
                    </div>
                    <div className="absolute -top-2 -right-2 bg-black border border-white/10 rounded-full p-2">
                      <Sparkles size={20} className="text-emerald-400" />
                    </div>
                  </div>
                  
                  <h3 className="text-3xl font-black mb-4">Generate Business Plan</h3>
                  <p className="text-gray-400 max-w-md mx-auto mb-10 text-sm leading-relaxed">
                    We will use our AI to draft a tailored, professional business plan based on your application form. This will form the core of your proposal to <span className="text-white font-bold">{opportunity.issuer_name}</span>.
                  </p>
                  
                  <button 
                    onClick={generateBusinessPlan}
                    disabled={isLoading}
                    className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-purple-500 to-indigo-600 px-8 py-5 font-black text-white drop-shadow-[0_10px_30px_rgba(168,85,247,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
                  >
                     {isLoading ? (
                       <span className="flex items-center gap-3">
                         <Loader2 className="animate-spin text-purple-200" size={24} />
                         Drafting Proposal...
                       </span>
                     ) : (
                       <span className="flex items-center gap-3">
                         <Wand2 size={24} />
                         Generate with AI
                       </span>
                     )}
                  </button>
                  <p className="text-xs text-gray-500 mt-6 font-medium uppercase tracking-widest flex items-center justify-center gap-2">
                    <ShieldCheck size={14} className="text-gray-600" /> Secure Processing
                  </p>
                </div>
              </div>
            )}

            {/* STEP 3: Compliance Documents */}
            {step === 3 && (
              <div className="max-w-2xl mx-auto animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="mb-8">
                  <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                    <ShieldCheck className="text-emerald-400" /> Compliance Files
                  </h3>
                  <p className="text-gray-400 text-sm">Select the documents to include in your submission pack from your vault.</p>
                </div>
                
                <div className="bg-black/30 border border-white/5 rounded-[2rem] p-2 mb-8">
                  {userDocs.length > 0 ? (
                    <div className="grid gap-2">
                      {userDocs.map(doc => {
                        const isSelected = selectedDocs.includes(doc.id);
                        return (
                          <div 
                            key={doc.id} 
                            onClick={() => toggleDocSelection(doc.id)}
                            className={`p-5 rounded-[1.5rem] cursor-pointer flex items-center justify-between transition-all group ${
                              isSelected 
                                ? 'bg-purple-500/10 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.5)]' 
                                : 'bg-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500/20 text-purple-400' : 'bg-black text-gray-500 group-hover:text-gray-300'}`}>
                                <FileCheck size={20} />
                              </div>
                              <div>
                                <p className={`font-bold text-sm transition-colors ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>{doc.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{doc.category || 'General'}</p>
                              </div>
                            </div>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500 text-white' : 'bg-black border border-white/10'}`}>
                              {isSelected && <Check size={14} strokeWidth={3} />}
                            </div>
                          </div>
                      )})}
                    </div>
                  ) : (
                    <div className="text-center py-12 px-6">
                      <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <Upload size={24} className="text-gray-500" />
                      </div>
                      <p className="text-white font-bold mb-2">No documents in vault</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto">Upload your CIPC, tax clearance, and ID documents in your Profile section first.</p>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-2xl p-6 flex items-start gap-4">
                  <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-400 mb-1">AI Business Plan Generated</h4>
                    <p className="text-xs text-emerald-400/80 leading-relaxed font-medium">Your business plan was successfully drafted and will be automatically included in the final pack. No action needed.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Download & Submit */}
            {step === 4 && (
              <div className="max-w-2xl mx-auto h-full flex flex-col justify-center animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="text-center mb-10">
                  <h3 className="text-3xl font-black mb-3">Submit Application</h3>
                  <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Review what's included. Choose how you want to submit your application below.
                  </p>
                </div>
                
                <div className="bg-black/40 border border-white/5 rounded-[2rem] p-8 mb-8 relative overflow-hidden backdrop-blur-xl">
                  {/* Decorative background elements */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
                  
                  <h4 className="font-black text-xs uppercase tracking-[0.2em] text-gray-500 mb-6 flex items-center gap-2">
                    Pack Contents (.zip)
                  </h4>
                  
                  <div className="space-y-2 relative z-10">
                    <label className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={includeAppForm} onChange={(e) => setIncludeAppForm(e.target.checked)} className="peer sr-only" />
                        <div className="w-5 h-5 rounded border-2 border-gray-600 peer-checked:bg-purple-500 peer-checked:border-purple-500 flex items-center justify-center transition-colors">
                          <Check size={12} className="text-transparent peer-checked:text-white" strokeWidth={4} />
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center"><FileSignature size={18} /></div>
                      <span className={`font-bold transition-colors ${includeAppForm ? "text-white" : "text-gray-500"}`}>1_Application_Form.pdf</span>
                    </label>

                    <label className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={includeBusinessPlan} onChange={(e) => setIncludeBusinessPlan(e.target.checked)} className="peer sr-only" />
                        <div className="w-5 h-5 rounded border-2 border-gray-600 peer-checked:bg-purple-500 peer-checked:border-purple-500 flex items-center justify-center transition-colors">
                          <Check size={12} className="text-transparent peer-checked:text-white" strokeWidth={4} />
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center"><Briefcase size={18} /></div>
                      <span className={`font-bold transition-colors ${includeBusinessPlan ? "text-white" : "text-gray-500"}`}>2_Business_Plan.pdf</span>
                    </label>

                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <div className="w-5 h-5 rounded border-2 bg-emerald-500 border-emerald-500 flex items-center justify-center">
                           <Check size={12} className="text-white" strokeWidth={4} />
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center"><ShieldCheck size={18} /></div>
                      <span className="font-bold text-white">3_Compliance_Docs/</span>
                      <span className="text-xs font-bold text-gray-500 bg-black px-2 py-1 rounded-lg ml-2">{selectedDocs.length} files</span>
                      <button onClick={() => setStep(3)} className="ml-auto text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider bg-white/5 px-3 py-2 rounded-lg transition-colors">Edit</button>
                    </div>
                  </div>
                </div>

                {isDirectSubmitting ? (
                  <div className="bg-[#0a0a1a] border border-emerald-500/30 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 shadow-[0_0_40px_rgba(16,185,129,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-emerald-500/5 pulse-animation"></div>
                    <Loader2 className="animate-spin text-emerald-400 relative z-10" size={36} />
                    <p className="font-bold text-emerald-400 text-lg relative z-10 text-center animate-pulse">{directSubmitStatus}</p>
                    <div className="w-full max-w-xs h-1.5 bg-white/5 rounded-full overflow-hidden mt-4 relative z-10">
                       <div className="h-full bg-emerald-500 rounded-full w-1/2" style={{animation: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate"}}></div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={handleDirectSubmit}
                      disabled={isLoading || (!includeAppForm && !includeBusinessPlan && selectedDocs.length === 0)}
                      className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/90 to-purple-600/90 hover:from-indigo-500 hover:to-purple-600 p-6 font-black text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_4px_20px_rgba(168,85,247,0.3)] text-left border border-white/10"
                    >
                       <div>
                         <div className="p-3 bg-white/20 rounded-xl mb-4 group-hover:scale-110 transition-transform inline-block"><Zap size={24} className="text-white drop-shadow-md" fill="currentColor" /></div>
                         <h4 className="text-xl mb-2 drop-shadow-sm">Direct Connect</h4>
                         <p className="text-xs text-white/85 font-medium leading-relaxed drop-shadow-sm">Send instantly to {opportunity.issuer_name} via secure API bridging. Fast-Track timeline.</p>
                       </div>
                       <span className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-2 py-1 rounded text-[10px] uppercase tracking-widest font-black shadow-sm">Recommended</span>
                    </button>
                    
                    <button 
                      onClick={handleDownloadPack}
                      disabled={isLoading || (!includeAppForm && !includeBusinessPlan && selectedDocs.length === 0)}
                      className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-6 font-black text-white hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 text-left"
                    >
                      {isLoading ? (
                        <div className="flex flex-col items-start">
                          <div className="p-3 bg-white/10 rounded-xl mb-4 inline-block"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                          <h4 className="text-xl mb-2">Zipping Files...</h4>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start">
                          <div className="p-3 bg-white/10 rounded-xl mb-4 group-hover:scale-110 transition-transform inline-block"><Download size={24} className="text-gray-400 group-hover:text-white transition-colors" /></div>
                          <h4 className="text-xl mb-2">Manual Download</h4>
                          <p className="text-xs text-gray-400 font-medium leading-relaxed group-hover:text-gray-300 transition-colors">Download a complete .ZIP pack to submit via the traditional standard portal.</p>
                        </div>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-white/5 bg-black/20 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-20 backdrop-blur-md">
            <button 
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1 || isLoading}
              className="w-full sm:w-auto px-6 py-4 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-0 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={18} /> Back
            </button>
            
            {step < 4 && (
              <button 
                onClick={async () => {
                  if (step === 1) {
                    await saveDraft();
                  }
                  setStep(Math.min(4, step + 1));
                }}
                disabled={isLoading || (step === 1 && (!formData.businessName || !formData.fundingRequested))}
                className="w-full sm:w-auto px-10 py-4 rounded-xl font-black bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(168,85,247,0.2)]"
              >
                Continue <ArrowRight size={18} />
              </button>
            )}
            {step === 4 && !isLoading && (
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-500" /> Information Secure
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplicationWorkflow;


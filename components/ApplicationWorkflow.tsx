import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, FileText, Download, Loader2, ArrowRight, ArrowLeft, FileSignature, Briefcase, ShieldCheck, FileCheck, Upload, Wand2 } from 'lucide-react';
import { FundingOpportunity, User, ApplicationStatus, AppDocument } from '../types';
import { GoogleGenAI } from '@google/genai';
import { db } from '../services/firebase';
import { addDoc, collection, updateDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/firebase';

interface ApplicationWorkflowProps {
  opportunity: FundingOpportunity;
  user: User;
  onClose: () => void;
  onComplete: () => void;
}

const ApplicationWorkflow: React.FC<ApplicationWorkflowProps> = ({ opportunity, user, onClose, onComplete }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [businessPlan, setBusinessPlan] = useState('');
  const [userDocs, setUserDocs] = useState<AppDocument[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [includeAppForm, setIncludeAppForm] = useState(true);
  const [includeBusinessPlan, setIncludeBusinessPlan] = useState(true);
  
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
    // Pre-fill from profile if available
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

    // Load user documents for compliance step
    const fetchDocs = async () => {
      try {
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docSnapshot = await getDocs(docsRef);
        const fetchedDocs = docSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppDocument));
        setUserDocs(fetchedDocs);
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
    
    setTimeout(() => setIsAutoFilling(false), 1000);
  };

  const generateBusinessPlan = async () => {
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Generate a comprehensive, professional 1-page business plan/proposal for ${formData.businessName} applying for ${opportunity.title} (${opportunity.provider}). 
      Funding requested: ${formData.fundingRequested}. 
      Purpose: ${formData.purpose}.
      Make it structured with Executive Summary, Market Opportunity, Use of Funds, and Team. Format it beautifully using Markdown.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
      });
      
      setBusinessPlan(response.text || 'Failed to generate business plan.');
      setStep(3);
    } catch (error) {
      console.error('Failed to generate plan:', error);
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

  const handleDownloadPack = async () => {
    setIsLoading(true);
    // Simulate downloading a pack (zip file creation)
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Update application in Firestore to SUBMITTED
    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.id));
    
    try {
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const appDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', user.id, 'applications', appDoc.id), {
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      } else {
        // Fallback if not found
        const newApplication = {
          opportunityId: opportunity.id,
          opportunityTitle: opportunity.title,
          provider: opportunity.provider,
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.type
        };
        await addDoc(appsRef, newApplication);
      }
      
      // Also update local storage for offline support
      const applications = JSON.parse(localStorage.getItem('fundhub_applications') || '[]');
      const existingIndex = applications.findIndex((a: any) => a.opportunityId === opportunity.id && a.userId === user.id);
      
      if (existingIndex >= 0) {
        applications[existingIndex].status = ApplicationStatus.SUBMITTED;
        applications[existingIndex].date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        localStorage.setItem('fundhub_applications', JSON.stringify(applications));
      } else {
        const newApplication = {
          opportunityId: opportunity.id,
          opportunityTitle: opportunity.title,
          provider: opportunity.provider,
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.type
        };
        localStorage.setItem('fundhub_applications', JSON.stringify([...applications, { ...newApplication, id: Math.random().toString(36).substr(2, 9), userId: user.id }]));
      }
      
      setIsLoading(false);
      onComplete();
    } catch (error) {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2rem] w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <h2 className="text-xl font-black text-white">Application Workflow</h2>
            <p className="text-sm text-gray-400">{opportunity.title} • {opportunity.provider}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex border-b border-white/5">
          {[
            { num: 1, label: 'Application Form', icon: FileSignature },
            { num: 2, label: 'Business Plan', icon: Briefcase },
            { num: 3, label: 'Compliance Docs', icon: ShieldCheck },
            { num: 4, label: 'Download Pack', icon: Download }
          ].map((s) => (
            <div key={s.num} className={`flex-1 py-4 px-2 text-center border-b-2 transition-all ${step >= s.num ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-gray-600'}`}>
              <div className="flex flex-col items-center gap-2">
                <s.icon size={20} className={step >= s.num ? 'text-purple-400' : 'text-gray-600'} />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
          
          {/* STEP 1: Form */}
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-right-8 duration-300">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-black mb-2">Funding Application Form</h3>
                <p className="text-gray-400">Please fill in the details required by {opportunity.provider}.</p>
              </div>
              
              <div className="flex justify-end">
                <button 
                  onClick={handleAutoFill}
                  disabled={isAutoFilling}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {isAutoFilling ? <CheckCircle2 size={16} /> : <Wand2 size={16} />}
                  {isAutoFilling ? 'Auto-filled!' : 'Auto-fill from Profile'}
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Business Name</label>
                  <input type="text" value={formData.businessName} onChange={e => setFormData({...formData, businessName: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Registration Number</label>
                  <input type="text" value={formData.registrationNumber} onChange={e => setFormData({...formData, registrationNumber: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Funding Requested (R)</label>
                  <input type="text" placeholder="e.g. R500,000" value={formData.fundingRequested} onChange={e => setFormData({...formData, fundingRequested: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Contact Phone</label>
                  <input type="text" value={formData.contactPhone} onChange={e => setFormData({...formData, contactPhone: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Purpose of Funding</label>
                <textarea rows={4} placeholder="Briefly describe how you will use the funds..." value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"></textarea>
              </div>
            </div>
          )}

          {/* STEP 2: Proposal Generation */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto text-center space-y-8 animate-in slide-in-from-right-8 duration-300 py-12">
              <div className="w-24 h-24 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-6">
                <Briefcase size={48} className="text-purple-400" />
              </div>
              <h3 className="text-3xl font-black">Generate Business Plan PDF</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                We will use Gemini 3.1 Pro to draft a tailored, professional business plan based on your application form and profile. This is required for {opportunity.type.toLowerCase()} applications.
              </p>
              
              <button 
                onClick={generateBusinessPlan}
                disabled={isLoading}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-purple-500/20 mx-auto disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" size={24} /> : <FileText size={24} />}
                {isLoading ? 'Drafting Business Plan...' : 'Generate Business Plan via AI'}
              </button>
            </div>
          )}

          {/* STEP 3: Compliance Documents */}
          {step === 3 && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-right-8 duration-300">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-black mb-2">Compliance Documents</h3>
                <p className="text-gray-400">Select the required compliance documents to include in your submission pack.</p>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h4 className="font-bold mb-4 flex items-center gap-2"><ShieldCheck className="text-purple-400" size={20} /> Required for {opportunity.provider}</h4>
                
                {userDocs.length > 0 ? (
                  <div className="space-y-3">
                    {userDocs.map(doc => (
                      <div 
                        key={doc.id} 
                        onClick={() => toggleDocSelection(doc.id)}
                        className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${selectedDocs.includes(doc.id) ? 'bg-purple-500/10 border-purple-500/50' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                      >
                        <div className="flex items-center gap-3">
                          <FileCheck size={20} className={selectedDocs.includes(doc.id) ? 'text-purple-400' : 'text-gray-500'} />
                          <div>
                            <p className={`font-bold text-sm ${selectedDocs.includes(doc.id) ? 'text-white' : 'text-gray-300'}`}>{doc.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{doc.category || 'General Document'}</p>
                          </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedDocs.includes(doc.id) ? 'border-purple-500 bg-purple-500' : 'border-gray-600'}`}>
                          {selectedDocs.includes(doc.id) && <CheckCircle2 size={14} className="text-white" />}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-white/10 rounded-xl">
                    <Upload size={32} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-400 font-bold mb-1">No documents found</p>
                    <p className="text-xs text-gray-500">Please upload your ID, CIPC, and Tax Clearance in your Profile.</p>
                  </div>
                )}
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex items-start gap-4">
                <CheckCircle2 className="text-emerald-400 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-emerald-400 mb-1">Business Plan Generated</h4>
                  <p className="text-sm text-emerald-400/80">Your AI-generated business plan has been successfully created and will be included in the final pack.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Download & Submit */}
          {step === 4 && (
            <div className="max-w-2xl mx-auto text-center space-y-8 animate-in slide-in-from-right-8 duration-300 py-12">
              <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                <Download size={48} className="text-emerald-400" />
              </div>
              <h3 className="text-3xl font-black">Download Submission Pack</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Your entire application pack is ready. Download it now for physical submission or to send via email to the funder.
              </p>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left max-w-sm mx-auto space-y-4">
                <h4 className="font-bold text-sm uppercase tracking-widest text-gray-500 mb-4">Pack Contents (.ZIP)</h4>
                
                <label className="flex items-center gap-3 text-sm cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors">
                  <input 
                    type="checkbox" 
                    checked={includeAppForm} 
                    onChange={(e) => setIncludeAppForm(e.target.checked)} 
                    className="w-4 h-4 rounded border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900 bg-gray-800" 
                  />
                  <FileText size={16} className={includeAppForm ? "text-purple-400" : "text-gray-600"}/> 
                  <span className={includeAppForm ? "text-white" : "text-gray-500 line-through"}>1_Application_Form.pdf</span>
                </label>

                <label className="flex items-center gap-3 text-sm cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors">
                  <input 
                    type="checkbox" 
                    checked={includeBusinessPlan} 
                    onChange={(e) => setIncludeBusinessPlan(e.target.checked)} 
                    className="w-4 h-4 rounded border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900 bg-gray-800" 
                  />
                  <FileText size={16} className={includeBusinessPlan ? "text-purple-400" : "text-gray-600"}/> 
                  <span className={includeBusinessPlan ? "text-white" : "text-gray-500 line-through"}>2_Business_Plan.pdf</span>
                </label>

                <div className="flex items-center gap-3 text-sm p-2 -mx-2">
                  <ShieldCheck size={16} className="text-purple-400"/> 
                  <span className="text-white">3_Compliance_Docs/ ({selectedDocs.length} files)</span>
                  <button onClick={() => setStep(3)} className="ml-auto text-xs text-purple-400 hover:text-purple-300 underline">Edit</button>
                </div>
              </div>

              <button 
                onClick={handleDownloadPack}
                disabled={isLoading || (!includeAppForm && !includeBusinessPlan && selectedDocs.length === 0)}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-500/20 mx-auto disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" size={24} /> : <Download size={24} />}
                {isLoading ? 'Generating Zip File...' : 'Download Pack & Mark as Submitted'}
              </button>
              <p className="text-xs text-gray-500 mt-4">
                Only when you download this pack will the application be deemed as "Submitted" on your dashboard.
              </p>
            </div>
          )}

        </div>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-white/10 bg-white/5 flex justify-between items-center">
          <button 
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || isLoading}
            className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 flex items-center gap-2"
          >
            <ArrowLeft size={18} /> Back
          </button>
          
          {step < 4 && (
            <button 
              onClick={() => setStep(Math.min(4, step + 1))}
              disabled={isLoading || (step === 1 && (!formData.businessName || !formData.fundingRequested))}
              className="px-8 py-3 rounded-xl font-black bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-white/10"
            >
              Continue <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationWorkflow;

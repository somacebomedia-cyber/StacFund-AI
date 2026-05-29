import React, { useState, useEffect, useRef } from 'react';
import { Camera, Laptop, HelpCircle, Upload, X, Loader2, PenTool, BarChart3, CheckCircle2, ChevronRight, Plus, Trash2, Printer, Search, Link as LinkIcon, FileText, Check } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { User, AppDocument } from '../types';
import BusinessPlanDocument from './BusinessPlanDocument';

interface FundingNeedsTrackerProps {
  user: User | null;
  onUpgrade: () => void;
  businessInfo: any;
  ownerInfo: any;
}

export interface FundingNeed {
  id: string;
  itemName: string;
  estimatedCost: number;
  reason: string;
  status: 'pending' | 'applied' | 'received';
  appliedTo?: string;
  productLink?: string;
  quotationDocId?: string;
  quotationDocName?: string;
}

const FundingNeedsTracker: React.FC<FundingNeedsTrackerProps> = ({ user, onUpgrade, businessInfo, ownerInfo }) => {
  const [needs, setNeeds] = useState<FundingNeed[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newItem, setNewItem] = useState({ itemName: '', estimatedCost: '', reason: '', appliedTo: '' });
  
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [generatedBusinessPlanData, setGeneratedBusinessPlanData] = useState<any | null>(null);

  const [editingLinkFor, setEditingLinkFor] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQuotationFor, setUploadingQuotationFor] = useState<string | null>(null);

  useEffect(() => {
    const fetchNeeds = async () => {
      if (!user) return;
      try {
        const needsRef = collection(db, 'users', user.id, 'funding_needs');
        const snap = await getDocs(needsRef);
        const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingNeed));
        setNeeds(fetched);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNeeds();
  }, [user]);

  const handleAddNeed = async () => {
    if (!user) return;
    if (!newItem.itemName || !newItem.estimatedCost) return;
    
    try {
      const needsRef = collection(db, 'users', user.id, 'funding_needs');
      const docData: Omit<FundingNeed, 'id'> = {
        itemName: newItem.itemName,
        estimatedCost: Number(newItem.estimatedCost),
        reason: newItem.reason,
        status: 'pending',
        appliedTo: newItem.appliedTo
      };
      const docRef = await addDoc(needsRef, docData);
      setNeeds([...needs, { id: docRef.id, ...docData }]);
      setNewItem({ itemName: '', estimatedCost: '', reason: '', appliedTo: '' });
      setIsAdding(false);
    } catch (e) {
      console.error(e);
      alert('Failed to add need');
    }
  };

  const handleRemoveNeed = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.id, 'funding_needs', id));
      setNeeds(needs.filter(n => n.id !== id));
    } catch (e) {
      console.error(e);
    }
  };
  
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    if (!user) return;
    const nextStatus = currentStatus === 'pending' ? 'applied' : currentStatus === 'applied' ? 'received' : 'pending';
    try {
      await updateDoc(doc(db, 'users', user.id, 'funding_needs', id), { status: nextStatus });
      setNeeds(needs.map(n => n.id === id ? { ...n, status: nextStatus as any } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveLink = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.id, 'funding_needs', id), { productLink: tempLink });
      setNeeds(needs.map(n => n.id === id ? { ...n, productLink: tempLink } : n));
      setEditingLinkFor(null);
    } catch (e) {
      console.error("Failed to save link", e);
    }
  };

  const handleUploadQuotation = async (e: React.ChangeEvent<HTMLInputElement>, needId: string) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    const file = files[0];
    
    try {
      setUploadingQuotationFor(needId);
      const docsRef = collection(db, 'users', user.id, 'documents');
      const newDoc = {
          userId: user.id,
          name: `Quotation: ${file.name}`,
          type: file.type || 'application/pdf',
          size: file.size,
          uploadDate: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          category: 'Quotation'
      };
      
      const docRef = await addDoc(docsRef, newDoc);
      
      await updateDoc(doc(db, 'users', user.id, 'funding_needs', needId), { 
        quotationDocId: docRef.id,
        quotationDocName: newDoc.name
      });
      
      setNeeds(needs.map(n => n.id === needId ? { ...n, quotationDocId: docRef.id, quotationDocName: newDoc.name } : n));
    } catch (error) {
      console.error("Failed to upload quotation", error);
      alert("Failed to upload quotation");
    } finally {
      setUploadingQuotationFor(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateProposal = async (type: 'proposal' | 'businessplan', need: FundingNeed) => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }

    if (!user || (!businessInfo?.name && !user.businessName)) {
      alert('Please fill in your business name in your profile before generating a document.');
      return;
    }
    
    setIsGeneratingProposal(true);
    setGeneratedBusinessPlanData(null);
    
    const financialDocs = 'Quotations for ' + need.itemName;

    const fundingSpecifics = `
         FUNDING SPECIFICS (CRITICAL - THIS PROPOSAL IS SPECIFICALLY FOR THIS NEED):
         - Item Needed: ${need.itemName}
         - Amount Requested: R${need.estimatedCost.toLocaleString()}
         - Purpose of Funding: ${need.reason || `To acquire ${need.itemName} for business operations.`}
         - Business Impact: Essential equipment for growth and operational efficiency
         - Expected Revenue Impact/ROI: Immediate improvement in service delivery
    `;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const businessPlanSchema = {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: "A rich, 4–6 paragraph executive summary covering the business vision, problem solved, solution, traction, and funding ask."
          },
          problemStatement: {
            type: Type.STRING,
            description: "2–3 paragraphs describing the specific market problem this business solves, with South African context where relevant."
          },
          solution: {
            type: Type.STRING,
            description: "2–3 paragraphs describing the business solution, unique approach, and core value proposition."
          },
          businessModel: {
            type: Type.OBJECT,
            properties: {
              revenueStreams: { type: Type.ARRAY, items: { type: Type.STRING } },
              customerAcquisition: { type: Type.STRING },
              keyPartnerships: { type: Type.ARRAY, items: { type: Type.STRING } },
              costStructure: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          swot: {
            type: Type.OBJECT,
            properties: {
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              threats: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          marketResearch: {
            type: Type.OBJECT,
            properties: {
              tam: { type: Type.STRING, description: "Total Addressable Market in ZAR with reasoning" },
              sam: { type: Type.STRING, description: "Serviceable Addressable Market in ZAR with reasoning" },
              som: { type: Type.STRING, description: "Serviceable Obtainable Market in ZAR with reasoning" },
              targetAudience: { type: Type.ARRAY, items: { type: Type.STRING } },
              competitorAnalysis: { type: Type.STRING, description: "At least 300 words covering 3–4 competitors with positioning comparison" },
              marketTrends: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          productsServices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING, description: "At least 3 sentences" },
                pricing: { type: Type.STRING },
                differentiator: { type: Type.STRING },
              }
            }
          },
          goToMarket: {
            type: Type.OBJECT,
            properties: {
              strategy: { type: Type.STRING, description: "3–4 paragraphs on go-to-market approach" },
              channels: { type: Type.ARRAY, items: { type: Type.STRING } },
              milestones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    quarter: { type: Type.STRING },
                    goal: { type: Type.STRING },
                  }
                }
              }
            }
          },
          operationsPlan: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING },
              keyActivities: { type: Type.ARRAY, items: { type: Type.STRING } },
              technologyStack: { type: Type.ARRAY, items: { type: Type.STRING } },
              location: { type: Type.STRING },
            }
          },
          team: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                role: { type: Type.STRING },
                responsibilities: { type: Type.STRING },
                background: { type: Type.STRING },
              }
            }
          },
          financialPlan: {
            type: Type.OBJECT,
            properties: {
              fundingRequirement: { type: Type.STRING },
              fundingPurpose: { type: Type.STRING, description: "At least 2 paragraphs" },
              useOfFunds: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    amount: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  }
                }
              },
              revenueProjections: {
                type: Type.OBJECT,
                properties: {
                  y1: { type: Type.STRING },
                  y2: { type: Type.STRING },
                  y3: { type: Type.STRING },
                  assumptions: { type: Type.STRING },
                }
              },
              breakEven: { type: Type.STRING },
            }
          },
          riskMitigation: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                risk: { type: Type.STRING },
                impact: { type: Type.STRING },
                mitigation: { type: Type.STRING },
              }
            }
          },
          conclusion: {
            type: Type.STRING,
            description: "A strong 2–3 paragraph closing call to action directed at the funder."
          }
        }
      };

      const prompt = `You are a senior South African business consultant writing a PREMIUM, INVESTOR-GRADE ${type === 'businessplan' ? 'Detailed Business Plan' : 'Funding Proposal'}. This document will be submitted to formal funding bodies including NYDA, SEFA, IDC, NEF, and commercial banks. It must be thorough, specific, and compelling.

BUSINESS IDENTITY:
- Business Name: ${businessInfo?.name || user.businessName}
- Industry: ${businessInfo?.industry || 'General Services'}
- Business Type: Private Company
- Description: ${businessInfo?.description || 'A growing South African enterprise.'}
- Products & Services: Standard industry offerings.
- Years in Operation: Early stage
- Current Employees: Lean founding team
- Current Revenue: Pre-revenue / early revenue
- B2B Connections: Building pipeline

FINANCIAL DOCUMENT CONTEXT: ${financialDocs || 'None uploaded — use realistic SA industry benchmarks'}

${fundingSpecifics}

WRITING REQUIREMENTS:
1. Write every section in full, professional prose — no placeholder text, no "TBD", no vague filler.
2. Maximize the detail and depth of every section. The output must be exceptionally comprehensive, mirroring the extreme depth of a 90-page premium consulting document.
3. All financial figures must be in South African Rand (ZAR) and be internally consistent across sections.
4. Market sizing (TAM/SAM/SOM) must include the reasoning behind the numbers.
5. Competitor analysis must name at least 3 realistic competitors in the South African market and explain positioning extensively.
6. The go-to-market milestones must be quarterly and span 12 months with rich tactical steps.
7. Risk mitigation must cover at least 6 specific business risks with concrete responses.
8. The conclusion must be a direct, persuasive call to action addressed to the funder.
9. Focus the executive summary tightly around the requested funding need.
10. Expand wildly on every array or list; provide as many examples, items, and team members as realistically logical.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: businessPlanSchema,
          maxOutputTokens: 8192
        }
      });
      
      setGeneratedBusinessPlanData({ ...JSON.parse(response.text || '{}'), docType: type === 'businessplan' ? `Business Plan: ${need.itemName}` : `Funding Proposal: ${need.itemName}` });
    } catch (e) {
      console.error(e);
      alert('Generation failed. Check your connection.');
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const isPaid = user?.subscriptionPlan !== 'free';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h3 className="text-2xl font-black flex items-center gap-2">Funding Needs Tracker</h3>
           <p className="text-gray-400 text-sm">List specific assets you need funding for and generate custom proposals.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />} {isAdding ? 'Cancel' : 'Add New Need'}
        </button>
      </div>

      {isAdding && (
        <div className="glass-panel p-6 rounded-3xl border border-indigo-500/30 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Item Name</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g. High-end Laptop, Outdoor Jungle Gym"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={newItem.itemName}
                  onChange={e => setNewItem({...newItem, itemName: e.target.value})}
                />
             </div>
             <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Estimated Cost (ZAR)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 50000"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={newItem.estimatedCost}
                  onChange={e => setNewItem({...newItem, estimatedCost: e.target.value})}
                />
             </div>
             <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Applying To (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. NYDA, NEF, SEDFA"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={newItem.appliedTo}
                  onChange={e => setNewItem({...newItem, appliedTo: e.target.value})}
                />
             </div>
          </div>
          <div className="space-y-1 mb-6">
             <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Reason / Why you need it</label>
             <textarea 
               placeholder="Briefly explain why this is needed (e.g. 'To run local AI models and automate admin work')"
               className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-20"
               value={newItem.reason}
               onChange={e => setNewItem({...newItem, reason: e.target.value})}
             />
          </div>
          <button 
             onClick={handleAddNeed}
             disabled={!newItem.itemName || !newItem.estimatedCost}
             className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
             Save Funding Need
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>
      ) : needs.length === 0 && !isAdding ? (
        <div className="glass-panel p-16 rounded-3xl text-center border-dashed border-2 border-white/10 opacity-70">
           <Camera size={48} className="mx-auto text-gray-600 mb-4" />
           <p className="text-gray-400 font-bold">No funding needs added yet. Start adding items like a Laptop or Camera!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 mt-6">
           {needs.map(need => (
             <div key={need.id} className="glass-panel p-6 rounded-3xl relative overflow-hidden group border border-white/5">
                <div className="absolute top-0 right-0 p-3 rounded-bl-3xl bg-white/5 flex gap-2">
                   <button 
                     onClick={() => handleRemoveNeed(need.id)}
                     className="text-gray-500 hover:text-red-400 transition-colors"
                   >
                     <Trash2 size={16} />
                   </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                   <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                         <h4 className="text-xl font-black">{need.itemName}</h4>
                         <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded cursor-pointer ${need.status === 'received' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : need.status === 'applied' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}`} onClick={() => handleToggleStatus(need.id, need.status)}>
                            {need.status === 'received' ? 'Received ✓' : need.status === 'applied' ? 'Applied' : 'Pending'}
                         </span>
                      </div>
                      
                      <div className="text-cyan-400 font-black text-2xl mb-4">
                         R{need.estimatedCost.toLocaleString()}
                      </div>
                      
                      {need.reason && (
                         <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4">
                            <p className="text-sm font-medium text-gray-300 italic">"{need.reason}"</p>
                         </div>
                      )}
                      
                      {need.appliedTo && (
                         <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                            Applied to: <span className="text-white">{need.appliedTo}</span>
                         </p>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 border-t border-white/5 pt-4">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><LinkIcon size={12} /> Product Link</p>
                          {editingLinkFor === need.id ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                autoFocus
                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none"
                                value={tempLink}
                                onChange={e => setTempLink(e.target.value)}
                                placeholder="https://"
                              />
                              <button onClick={() => handleSaveLink(need.id)} className="bg-emerald-500 hover:bg-emerald-400 text-white rounded p-1"><Check size={16}/></button>
                              <button onClick={() => setEditingLinkFor(null)} className="bg-gray-700 hover:bg-gray-600 rounded p-1"><X size={16}/></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {need.productLink ? (
                                <a href={need.productLink} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:underline truncate max-w-[200px]">{need.productLink}</a>
                              ) : (
                                <span className="text-sm text-gray-600 italic">No link added</span>
                              )}
                              <button onClick={() => {setTempLink(need.productLink || ''); setEditingLinkFor(need.id);}} className="text-gray-500 hover:text-white text-xs ml-2 underline">Edit</button>
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><FileText size={12} /> Quotation PDF</p>
                           {need.quotationDocName ? (
                             <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded px-3 py-1.5 w-fit">
                               <FileText size={14} className="text-emerald-400" />
                               <span className="text-sm font-bold truncate max-w-[150px]">{need.quotationDocName}</span>
                               <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded ml-1">Vault</span>
                             </div>
                           ) : (
                             <div>
                               {uploadingQuotationFor === need.id ? (
                                 <div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-gray-400" /><span className="text-xs text-gray-400">Uploading...</span></div>
                               ) : (
                                 <button onClick={() => {setUploadingQuotationFor(need.id); fileInputRef.current?.click();}} className="text-xs flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors text-gray-300">
                                   <Upload size={14} /> Upload PDF to Vault
                                 </button>
                               )}
                             </div>
                           )}
                        </div>
                      </div>
                   </div>

                   <div className="w-full lg:w-72 space-y-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Generate Document</p>
                      <button 
                        onClick={() => handleGenerateProposal('proposal', need)}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all text-left"
                      >
                         <div className="flex items-center gap-3">
                           <PenTool size={16} className="text-cyan-400" />
                           <span className="text-xs font-bold">Funding Proposal</span>
                         </div>
                         <ChevronRight size={14} className="text-gray-600" />
                      </button>
                      
                      <button 
                        onClick={() => handleGenerateProposal('businessplan', need)}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-left"
                      >
                         <div className="flex items-center gap-3">
                           <BarChart3 size={16} className="text-indigo-400" />
                           <span className="text-xs font-bold">Business Plan</span>
                         </div>
                         <ChevronRight size={14} className="text-gray-600" />
                      </button>

                      <button 
                        onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(need.itemName + " price South Africa")}`, '_blank')}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left mt-2"
                      >
                         <div className="flex items-center gap-3">
                           <Search size={16} className="text-emerald-400" />
                           <span className="text-xs font-bold">Find Quotations</span>
                         </div>
                         <ChevronRight size={14} className="text-gray-600" />
                      </button>
                   </div>
                </div>
             </div>
           ))}
        </div>
      )}

      {isGeneratingProposal && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
           <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
           <p className="text-lg font-black text-white animate-pulse">Generating your custom document...</p>
        </div>
      )}

      {generatedBusinessPlanData && (
        <BusinessPlanDocument
           data={generatedBusinessPlanData}
           businessInfo={{...businessInfo, ...ownerInfo}}
           title={generatedBusinessPlanData.docType}
           onClose={() => setGeneratedBusinessPlanData(null)}
        />
      )}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".pdf" 
        onChange={e => uploadingQuotationFor && handleUploadQuotation(e, uploadingQuotationFor)} 
      />
    </div>
  );
};

export default FundingNeedsTracker;

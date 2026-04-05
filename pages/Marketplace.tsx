
import React, { useState, useEffect } from 'react';
import { Search, Globe, DollarSign, Users, Clock, CheckCircle2, Sparkles, Loader2, ExternalLink, ArrowRight, X, Calendar, Info, RefreshCw, Database, Lock, Briefcase, Bell } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { MOCK_FUNDING } from '../constants';
import { FundingType, User, Application, ApplicationStatus, FundingOpportunity } from '../types';
import FundingCard from '../components/FundingCard';
import ApplicationWorkflow from '../components/ApplicationWorkflow';

interface MarketplaceProps {
  user: User | null;
  activeOpportunityId?: string | null;
  resumeOpportunityId?: string | null;
  onGoToDashboard: () => void;
  onSetActiveOpportunity: (id: string | null) => void;
  onUpgrade: () => void;
}

const Marketplace: React.FC<MarketplaceProps> = ({ user, activeOpportunityId, resumeOpportunityId, onGoToDashboard, onSetActiveOpportunity, onUpgrade }) => {
  const [filter, setFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showToast, setShowToast] = useState<{show: boolean, message: string, type: 'success' | 'info'}>({ show: false, message: '', type: 'success' });
  const [isScanning, setIsScanning] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<FundingOpportunity | null>(null);
  const [workflowOpp, setWorkflowOpp] = useState<FundingOpportunity | null>(null);
  const [newOppAlert, setNewOppAlert] = useState<{show: boolean, count: number}>({ show: false, count: 0 });
  
  // The Encyclopedia State
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Initialize Data
  useEffect(() => {
    const storedOps = localStorage.getItem('fundhub_live_opportunities');
    const storedTime = localStorage.getItem('fundhub_last_scan');
    
    if (storedOps) {
      setOpportunities(JSON.parse(storedOps));
    } else {
      // Fallback to mock only if no live data exists
      setOpportunities(MOCK_FUNDING);
    }

    if (storedTime) {
      setLastUpdated(storedTime);
    }

    // Sync active ID prop
    if (activeOpportunityId) {
      const allOps = storedOps ? JSON.parse(storedOps) : MOCK_FUNDING;
      const opp = allOps.find((o: FundingOpportunity) => o.id === activeOpportunityId);
      if (opp) setSelectedOpp(opp);
    }
    
    // Sync resume ID prop
    if (resumeOpportunityId) {
      const allOps = storedOps ? JSON.parse(storedOps) : MOCK_FUNDING;
      const opp = allOps.find((o: FundingOpportunity) => o.id === resumeOpportunityId);
      if (opp) setWorkflowOpp(opp);
    }
  }, [activeOpportunityId, resumeOpportunityId]);

  // Monitor for new opportunities to alert
  useEffect(() => {
    const newCount = opportunities.filter(o => o.isNew).length;
    if (newCount > 0) {
      setNewOppAlert({ show: true, count: newCount });
    }
  }, [opportunities]);

  const filteredFunding = opportunities.filter(item => {
    const matchesFilter = filter === 'All' || item.type.toLowerCase() === filter.toLowerCase();
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const performLiveScan = async () => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }

    setIsScanning(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const searchResponse = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Find 10-12 distinct, currently active business funding opportunities, grants, enterprise development programs, or loan schemes available in South Africa for 2026/2027.
        Prioritize reliable sources like government agencies (NYDA, SEFA, IDC), major banks (Standard Bank, FNB, Nedbank), and established private foundations (Tony Elumelu, Allan Gray).
        Ensure the opportunities are specifically for SMEs or startups.
        Include details on the funding amount range (e.g. R50k - R5m), the application deadline, the provider name, and specific eligibility tags.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = searchResponse.text || '';
      
      if (!rawText) throw new Error("No results found from web scan.");

      const structureResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: `You are a data extractor. Analyze the following text about funding opportunities and extract them into a strict JSON array.
        
        TEXT SOURCE:
        ${rawText}
        
        INSTRUCTIONS:
        - Map valid types to: 'GRANT', 'LOAN', 'EQUITY', 'COMPETITION'.
        - If the type is unclear, infer it based on 'repayable' (LOAN) vs 'free money' (GRANT).
        - Ensure 'range' is in ZAR (R) if possible, or convert.
        - Ensure 'deadline' is a concise string (e.g. '30 Nov 2025' or 'Open').
        - Create 3 relevant tags per item (e.g. 'Youth', 'Tech', 'Agriculture').
        
        OUTPUT SCHEMA: Array of FundingOpportunity objects.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                provider: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['GRANT', 'LOAN', 'EQUITY', 'COMPETITION'] },
                description: { type: Type.STRING },
                range: { type: Type.STRING },
                deadline: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['title', 'provider', 'type', 'description']
            }
          }
        }
      });

      const parsedData = JSON.parse(structureResponse.text || '[]');
      
      const processedOps: FundingOpportunity[] = parsedData.map((op: any) => ({
        ...op,
        id: 'live_' + Math.random().toString(36).substr(2, 9), 
        isNew: true
      }));

      // Filter out existing MOCK data to ensure we replace it with fresh data
      // Keep previous LIVE scans if they are not duplicates
      const previousLiveOps = opportunities.filter(op => op.id.startsWith('live_'));
      const newTitles = new Set(processedOps.map(op => op.title.toLowerCase()));
      const uniquePreviousLive = previousLiveOps.filter(op => !newTitles.has(op.title.toLowerCase()));

      const updatedEncyclopedia = [...processedOps, ...uniquePreviousLive];

      setOpportunities(updatedEncyclopedia);
      localStorage.setItem('fundhub_live_opportunities', JSON.stringify(updatedEncyclopedia));
      
      const timeString = new Date().toLocaleString('en-ZA', { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', year: 'numeric' 
      });
      setLastUpdated(timeString);
      localStorage.setItem('fundhub_last_scan', timeString);

      setShowToast({
        show: true,
        message: `Encyclopedia Updated: ${processedOps.length} fresh opportunities found!`,
        type: 'success'
      });
      setTimeout(() => setShowToast({ ...showToast, show: false }), 4000);

    } catch (error) {
      console.error('Scan failed:', error);
      setShowToast({
        show: true,
        message: 'Scan failed. Please check your connection and try again.',
        type: 'info'
      });
      setTimeout(() => setShowToast({ ...showToast, show: false }), 4000);
    } finally {
      setIsScanning(false);
    }
  };

  const handleStartApplication = async (opportunityId: string) => {
    if (!user) {
      alert("Please log in to apply.");
      return;
    }
    const opportunity = opportunities.find(o => o.id === opportunityId);
    if (!opportunity) return;
    
    // Check if already applied via Firestore
    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunityId));
    
    let querySnapshot;
    try {
      querySnapshot = await getDocs(q);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${user.id}/applications`);
      return;
    }

    if (!querySnapshot.empty) {
      // If it exists, just open the workflow
      setWorkflowOpp(opportunity);
      return;
    }

    // Save application to Firestore as DRAFT
    const newApplication = {
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      provider: opportunity.provider,
      status: ApplicationStatus.DRAFT,
      date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      type: opportunity.type
    };
    
    try {
      await addDoc(appsRef, newApplication);
      
      // Also save to local storage for offline support
      const applications = JSON.parse(localStorage.getItem('fundhub_applications') || '[]');
      localStorage.setItem('fundhub_applications', JSON.stringify([...applications, { ...newApplication, id: Math.random().toString(36).substr(2, 9), userId: user.id }]));
      
      setWorkflowOpp(opportunity);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.id}/applications`);
    }
  };

  const handleWorkflowComplete = () => {
    setWorkflowOpp(null);
    setShowToast({ show: true, message: 'Application Pack Downloaded & Submitted!', type: 'success' });
    setTimeout(() => {
      setShowToast({ ...showToast, show: false });
      onGoToDashboard();
    }, 2000);
  };

  const handleViewDetails = (id: string) => {
    const opp = opportunities.find(o => o.id === id);
    if (opp) {
      setSelectedOpp(opp);
      onSetActiveOpportunity(id);
    }
  };

  const closeDetails = () => {
    setSelectedOpp(null);
    onSetActiveOpportunity(null);
  };

  const handleShowNew = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setNewOppAlert(prev => ({ ...prev, show: false }));
  };

  const isPaid = user?.subscriptionPlan !== 'free';

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 relative">
      {showToast.show && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-300">
          <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold border ${showToast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-[#0a0a1a] text-white border-white/20'}`}>
            {showToast.type === 'success' ? <CheckCircle2 size={20} /> : <Info size={20} />}
            {showToast.message}
          </div>
        </div>
      )}

      {/* New Opportunity Alert Notification */}
      {newOppAlert.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] w-full max-w-sm px-4 animate-in slide-in-from-bottom-10 duration-500">
          <div className="bg-[#0f0f29]/90 backdrop-blur-xl border border-purple-500/50 p-4 rounded-2xl shadow-2xl flex items-center gap-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-purple-600/10 group-hover:bg-purple-600/20 transition-colors"></div>
            <div className="absolute -left-2 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 to-indigo-500"></div>
            
            <div className="relative z-10 p-2 bg-purple-500/20 rounded-xl text-purple-400">
               <Bell size={24} className="animate-bounce" />
            </div>
            
            <div className="flex-1 relative z-10">
              <h4 className="font-black text-sm text-white mb-0.5">{newOppAlert.count} New Opportunities</h4>
              <p className="text-xs text-gray-400">Relevant funding matches found.</p>
            </div>

            <div className="flex flex-col gap-1 relative z-10">
               <button 
                 onClick={handleShowNew}
                 className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
               >
                 View
               </button>
               <button 
                 onClick={() => setNewOppAlert(prev => ({...prev, show: false}))}
                 className="text-[10px] text-gray-500 hover:text-white font-bold"
               >
                 Dismiss
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero: Live Scanner */}
      <div className="mb-12">
        <div className="glass-panel p-1 rounded-[2.5rem] relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 animate-shimmer"></div>
          <div className="bg-[#050510]/80 backdrop-blur-xl rounded-[2.3rem] p-8 md:p-12 relative overflow-hidden">
             {/* Background Effects */}
             <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none"></div>
             
             <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
               <div className="max-w-2xl">
                 <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest mb-6 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                    <Globe size={12} className={isScanning ? "animate-spin" : ""} />
                    {isScanning ? 'Scanning Global Network...' : 'Live Funding Encyclopedia'}
                 </div>
                 <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight leading-none">
                   Find Active <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Funding</span>
                 </h2>
                 <p className="text-gray-400 text-lg leading-relaxed mb-6">
                   Our AI scans the web for the latest South African grants, loans, and equity deals. 
                   Replace outdated lists with verified, real-time opportunities.
                 </p>
                 <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                   <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg">
                     <Database size={14} className="text-purple-400" /> {opportunities.length} Opportunities Stored
                   </span>
                   {lastUpdated && (
                     <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg">
                       <Clock size={14} className="text-emerald-400" /> Updated: {lastUpdated}
                     </span>
                   )}
                 </div>
               </div>

               <div className="flex flex-col gap-4 w-full md:w-auto">
                 <button 
                   onClick={performLiveScan}
                   disabled={isScanning}
                   className="relative group bg-white text-black font-black text-lg px-8 py-5 rounded-2xl flex items-center justify-center gap-3 transition-all hover:bg-cyan-50 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:scale-100 shadow-xl shadow-cyan-500/10"
                 >
                   {isScanning ? (
                     <>
                       <Loader2 className="animate-spin text-cyan-600" size={24} />
                       <span>Scanning Web...</span>
                     </>
                   ) : (
                     <>
                       {!isPaid ? <Lock size={20} className="text-gray-900" /> : <RefreshCw className="group-hover:rotate-180 transition-transform duration-500" size={24} />}
                       <span>{!isPaid ? 'Unlock Live Scan' : 'Scan for Fresh Data'}</span>
                     </>
                   )}
                   {isPaid && !isScanning && <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>}
                 </button>
                 <p className="text-[10px] text-center text-gray-500 uppercase tracking-widest font-bold">
                   Powered by Google Gemini 2.0
                 </p>
               </div>
             </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* SPONSORED PARTNER BANNER - The correct way to do "Ads" */}
        <div className="w-full bg-gradient-to-r from-blue-900/40 to-[#050510] border border-blue-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
           <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-bl-xl z-20">
             Featured Partner
           </div>
           {/* Abstract logo pattern */}
           <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
           
           <div className="flex items-center gap-4 relative z-10">
              <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-lg">
                 {/* Placeholder for Bank Logo */}
                 <Briefcase size={32} className="text-blue-700" />
              </div>
              <div>
                 <h3 className="text-lg font-black text-white mb-1">Standard Bank Enterprise Loan</h3>
                 <p className="text-sm text-gray-400">Exclusive low-interest revolving credit for FundHub Pro users.</p>
              </div>
           </div>
           
           <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
             <button onClick={() => window.open('https://www.standardbank.co.za/southafrica/business/products-and-services/business-solutions/specialised-finance', '_blank')} className="flex-1 md:flex-none px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 whitespace-nowrap">
                Apply on Site
             </button>
           </div>
        </div>

        {/* Search and Filters */}
        <div className="sticky top-24 z-30 glass-panel p-2 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl shadow-black/20 backdrop-blur-md">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search encyclopedia..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none py-3 pl-12 pr-6 text-white placeholder:text-gray-600 focus:outline-none focus:ring-0 transition-all font-medium"
            />
          </div>
          
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto custom-scrollbar pb-1 md:pb-0 px-1">
            {['All', 'Grant', 'Loan', 'Equity', 'Competition'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat.toUpperCase())}
                className={`px-5 py-2 rounded-xl font-bold whitespace-nowrap text-xs uppercase tracking-wider transition-all ${
                  filter === cat.toUpperCase() || (cat === 'All' && filter === 'All') 
                    ? 'bg-white text-black shadow-lg' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-1 gap-0">
          {filteredFunding.length > 0 ? (
            filteredFunding.map(item => (
              <FundingCard 
                key={item.id} 
                opportunity={item} 
                onViewDetails={handleViewDetails}
                onStartApplication={handleStartApplication}
              />
            ))
          ) : (
            <div className="glass-panel p-20 text-center rounded-3xl border-dashed border-2 flex flex-col items-center gap-4 opacity-70">
               <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                 <Search size={32} className="text-gray-600" />
               </div>
               <div>
                 <h4 className="text-xl font-bold mb-2">No results found</h4>
                 <p className="text-gray-500 mb-6 max-w-sm">We couldn't find any stored opportunities matching "{searchQuery}". Try running a live web scan.</p>
                 <button onClick={performLiveScan} className="text-cyan-400 font-black hover:underline uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                   <RefreshCw size={14} /> Scan Web for New Data
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Opportunity Details Modal */}
      {selectedOpp && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={closeDetails}></div>
          <div className="relative w-full max-w-2xl bg-[#0a0a1a] border border-white/10 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-[80px] pointer-events-none"></div>
            
            <button 
              onClick={closeDetails}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-gray-500 hover:text-white transition-colors z-20"
            >
              <X size={24} />
            </button>

            <div className="relative z-10 mb-8">
               <div className="flex flex-wrap gap-2 mb-4">
                 <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold uppercase tracking-widest border border-purple-500/20">
                   {selectedOpp.type}
                 </div>
                 {selectedOpp.isNew && (
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-widest border border-cyan-500/20 animate-pulse">
                     <Sparkles size={10} /> Just Added
                   </div>
                 )}
               </div>
               <h2 className="text-3xl font-black mb-2 leading-tight">{selectedOpp.title}</h2>
               <p className="text-gray-400 text-lg flex items-center gap-2">
                 <Building2 size={16} className="text-gray-600" /> {selectedOpp.provider}
               </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 relative z-10">
               <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-center hover:bg-white/10 transition-colors">
                 <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold flex items-center gap-2"><DollarSign size={14} /> Funding Range</p>
                 <p className="text-xl font-black text-white">{selectedOpp.range}</p>
               </div>
               <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-center hover:bg-white/10 transition-colors">
                 <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold flex items-center gap-2"><Calendar size={14} /> Deadline</p>
                 <p className="text-xl font-black text-white">{selectedOpp.deadline}</p>
               </div>
            </div>

            <div className="space-y-6 mb-10 relative z-10">
               <div>
                 <h4 className="text-lg font-bold mb-3 flex items-center gap-2"><Info size={18} className="text-cyan-400" /> About this Opportunity</h4>
                 <div className="text-gray-300 leading-relaxed bg-white/5 p-6 rounded-2xl border border-white/5 text-sm">
                   {selectedOpp.description}
                 </div>
               </div>

               <div>
                 <h4 className="text-lg font-bold mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-400" /> Tags & Focus Areas</h4>
                 <div className="flex flex-wrap gap-2">
                   {selectedOpp.tags.map((tag, i) => (
                     <span key={i} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-default">
                       #{tag}
                     </span>
                   ))}
                 </div>
               </div>
            </div>

            <div className="flex gap-4 border-t border-white/10 pt-6 relative z-10">
              <button 
                onClick={() => {
                  handleStartApplication(selectedOpp.id);
                  closeDetails();
                }}
                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-500/20 active:scale-[0.98] group"
              >
                Start Application <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Application Workflow Modal */}
      {workflowOpp && user && (
        <ApplicationWorkflow
          opportunity={workflowOpp}
          user={user}
          onClose={() => setWorkflowOpp(null)}
          onComplete={handleWorkflowComplete}
        />
      )}
    </div>
  );
};

// Simple Icon component for the modal
const Building2 = ({ size, className }: { size: number, className: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </svg>
);

export default Marketplace;

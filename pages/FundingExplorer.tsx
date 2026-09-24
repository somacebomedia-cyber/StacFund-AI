import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Globe, DollarSign, Users, Clock, CheckCircle2, Sparkles, Loader2, ExternalLink, ArrowRight, X, Calendar, Info, RefreshCw, Database, Lock, Briefcase, Bell, Target, FileCheck, ShieldCheck, Server, Mic, AlertCircle } from 'lucide-react';
import { collection, addDoc, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { MOCK_FUNDING } from '../constants';
import { FundingType, User, ApplicationStatus, FundingOpportunityDb, UserBusinessProfile } from '../types';
import FundingCard from '../components/FundingCard';
import ApplicationWorkflow from '../components/ApplicationWorkflow';
import { calculateMatch, getMatchMeOpportunities, getApplyReadyOpportunities } from '../services/matchingEngine';
import { useSpeechRecognition } from '../utils/useSpeechRecognition';

interface FundingExplorerProps {
  user: User | null;
  activeOpportunityId?: string | null;
  resumeOpportunityId?: string | null;
  fallbackOpportunity?: any | null;
  onGoToDashboard: () => void;
  onSetActiveOpportunity: (id: string | null) => void;
  onClearResumeOpportunity: () => void;
  onUpgrade: () => void;
  onLogin: () => void;
}

const FundingExplorer: React.FC<FundingExplorerProps> = ({ user, activeOpportunityId, resumeOpportunityId, fallbackOpportunity, onGoToDashboard, onSetActiveOpportunity, onClearResumeOpportunity, onUpgrade, onLogin }) => {
  const [mode, setMode] = useState<'DISCOVER' | 'TIMELINE' | 'MATCH_ME' | 'APPLY_READY'>('DISCOVER');
  const [searchQueryInput, setSearchQueryInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showToast, setShowToast] = useState<{show: boolean, message: string, type: 'success' | 'info' | 'error'}>({ show: false, message: '', type: 'success' });
  const [selectedOpp, setSelectedOpp] = useState<FundingOpportunityDb | null>(null);
  const [workflowOpp, setWorkflowOpp] = useState<FundingOpportunityDb | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  
  // The Encyclopedia State
  const [opportunities, setOpportunities] = useState<FundingOpportunityDb[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Profile data for Match Engine
  const [userProfile, setUserProfile] = useState<UserBusinessProfile | null>(null);

  const triggerToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setShowToast({ show: true, message, type });
    toastTimer.current = setTimeout(() => {
      setShowToast({ show: false, message: '', type: 'info' });
    }, 4000);
  }, []);

  const {
    isListening,
    isSupported,
    interimText,
    stopListening,
    toggleListening,
  } = useSpeechRecognition({
    onResult: (transcript, isFinal) => {
      setSearchQueryInput(transcript);
      setSearchQuery(transcript);
      if (isFinal) {
        triggerToast(`Voice search: "${transcript}"`, 'info');
      }
    },
    onError: (errorMessage) => {
      triggerToast(errorMessage, 'error');
    },
  });

  const handleClearSearch = useCallback(() => {
    if (isListening) stopListening();
    setSearchQueryInput('');
    setSearchQuery('');
  }, [isListening, stopListening]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchQueryInput);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQueryInput]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const userDocRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().profile) {
          const p = userDoc.data().profile;
          setUserProfile({
            user_id: user.id,
            business_status: p.registered === 'Yes' ? 'REGISTERED' : 'CONCEPT',
            entity_type: p.type || 'PTY_LTD',
            industry: p.sector || 'Technology',
            location: 'National',
            revenue_band: 'PRE_REVENUE',
            staff_count: 1,
            has_bank_account: true,
            has_sars_tax: true,
            has_cipc_registration: p.registered === 'Yes',
            age: 0,
            documents_ready: ['CIPC', 'TAX_CLEARANCE', 'ID', 'BANK_STATEMENT']
          });
        }
      } catch (e) {
         console.error('Error fetching profile data', e);
      }
    };
    fetchProfile();
  }, [user?.id]);

  // Initialize Data from Firestore
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'funding_opportunities'));
        let ops: FundingOpportunityDb[] = [];
        
        const existingIds = new Set<string>();
        querySnapshot.forEach((docSnap) => {
          ops.push(docSnap.data() as FundingOpportunityDb);
          existingIds.add(docSnap.id);
        });

        // Sync new central registry items that aren't in Firestore yet
        const missingOps = MOCK_FUNDING.filter(op => !existingIds.has(op.opportunity_id));
        if (missingOps.length > 0) {
          const seedPromises = missingOps.map(async (op) => {
            const opRef = doc(db, 'funding_opportunities', op.opportunity_id);
            await setDoc(opRef, op);
            return op;
          });
          
          await Promise.all(seedPromises);
          ops = [...ops, ...missingOps];
        }
        
        setOpportunities(ops);

        // Also sync active & resume IDs based on the fetched global list
        if (activeOpportunityId) {
          const opp = ops.find(o => o.opportunity_id === activeOpportunityId);
          if (opp) setSelectedOpp(opp);
        }
        
        if (resumeOpportunityId) {
          let opp = ops.find(o => o.opportunity_id === resumeOpportunityId);
          if (!opp && fallbackOpportunity) {
            opp = {
              opportunity_id: resumeOpportunityId,
              programme_name: fallbackOpportunity.title || 'Unknown Opportunity',
              issuer_name: fallbackOpportunity.provider || 'Unknown Provider',
              issuer_type: 'PRIVATE',
              official_status: false,
              status: 'OPEN',
              funding_type: fallbackOpportunity.type || FundingType.GRANT,
              target_stage: 'Any',
              legal_form_required: [],
              sector_tags: [],
              geo_scope: 'National',
              amount_min: 0,
              amount_max: 0,
              non_cash_support: 'No',
              eligibility_summary: 'Opportunity details are currently unavailable. You can still continue your application.',
              required_documents: [],
              application_url: '',
              source_url: '',
              closing_date: 'Unknown',
              frequency: 'Once-off',
              contact_email: '',
              contact_phone: '',
              last_verified_at: new Date().toISOString(),
              verification_notes: '',
              confidence_score: 50
            } as FundingOpportunityDb;
          }
          if (opp) setWorkflowOpp(opp);
        }

      } catch (error) {
        console.error('Error fetching global opportunities', error);
        // Fallback to MOCK_FUNDING on fail
        setOpportunities(MOCK_FUNDING as FundingOpportunityDb[]);
      }
    };
    
    fetchOpportunities();

    const storedTime = localStorage.getItem('stacfund_last_scan');
    if (storedTime) {
      setLastUpdated(storedTime);
    }
  }, [activeOpportunityId, resumeOpportunityId, fallbackOpportunity?.id]);

  // Compute what to display based on mode
  const displayOpportunities = useMemo(() => {
     const q = searchQuery.trim().toLowerCase();
     const filtered = opportunities.filter(item => {
        if (!q) return true;
        const progName = (item.programme_name || '').toLowerCase();
        const eligSumm = (item.eligibility_summary || '').toLowerCase();
        const issuerName = (item.issuer_name || '').toLowerCase();
        const fundingType = (item.funding_type || '').toLowerCase();
        const sectorMatch = (item.sector_tags || []).some(t => t.toLowerCase().includes(q));
        
        return progName.includes(q) || 
               eligSumm.includes(q) || 
               issuerName.includes(q) || 
               fundingType.includes(q) || 
               sectorMatch;
     });

     if (mode === 'DISCOVER' || mode === 'TIMELINE') {
        return filtered.map(item => ({ item }));
     } else if (mode === 'MATCH_ME') {
        if (userProfile) {
           return getMatchMeOpportunities(userProfile, filtered);
        } else {
           return filtered.map(item => ({ item }));
        }
     } else if (mode === 'APPLY_READY') {
        if (userProfile) {
           return getApplyReadyOpportunities(userProfile, filtered);
        } else {
           return [];
        }
     }
     return [];
  }, [opportunities, searchQuery, mode, userProfile]);

  const handleStartApplication = React.useCallback(async (opportunityId: string) => {
    if (!user) {
      onLogin();
      return;
    }
    const opportunity = opportunities.find(o => o.opportunity_id === opportunityId);
    if (!opportunity) return;
    
    // Save draft application
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
      setWorkflowOpp(opportunity);
      return;
    }

    let logoUrl = opportunity.logo_url || null;
    if (!logoUrl || logoUrl.endsWith('.gif')) {
      try {
        let domain = null;
        if (opportunity.source_url) domain = new URL(opportunity.source_url).hostname;
        else if (opportunity.application_url) domain = new URL(opportunity.application_url).hostname;
        if (domain) logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      } catch (e) {
        // ignore
      }
    }

    try {
      await addDoc(appsRef, {
        opportunityId: opportunity.opportunity_id,
        opportunityTitle: opportunity.programme_name,
        provider: opportunity.issuer_name,
        logoUrl: logoUrl,
        status: ApplicationStatus.DRAFT,
        date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
        type: opportunity.funding_type
      });
      setWorkflowOpp(opportunity);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.id}/applications`);
    }
  }, [user, opportunities, onLogin]);

  const handleViewDetails = React.useCallback((id: string) => {
    const opp = opportunities.find(o => o.opportunity_id === id);
    if (opp) {
      setSelectedOpp(opp);
      onSetActiveOpportunity(id);
    }
  }, [opportunities, onSetActiveOpportunity]);

  const handleDownloadForm = React.useCallback((_id: string) => {}, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 relative">
      {showToast.show && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-300 pointer-events-none">
          <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold border backdrop-blur-xl ${
            showToast.type === 'error'
              ? 'bg-rose-500/90 text-white border-rose-400/80 shadow-rose-500/20'
              : showToast.type === 'info'
              ? 'bg-cyan-600/90 text-white border-cyan-400/80 shadow-cyan-500/20'
              : 'bg-emerald-500/90 text-white border-emerald-400/80 shadow-emerald-500/20'
          }`}>
            {showToast.type === 'error' ? (
              <AlertCircle size={20} className="shrink-0" />
            ) : showToast.type === 'info' ? (
              <Info size={20} className="shrink-0" />
            ) : (
              <CheckCircle2 size={20} className="shrink-0" />
            )}
            <span>{showToast.message}</span>
          </div>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="mb-12 glass-panel p-2 rounded-3xl inline-flex flex-wrap gap-2 items-center mx-auto shadow-2xl backdrop-blur-md border border-white/5 relative z-20">
         <button onClick={() => setMode('DISCOVER')} className={`px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'DISCOVER' ? 'bg-cyan-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
           <Globe size={18} /> Discover
         </button>
         <button onClick={() => setMode('TIMELINE')} className={`px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'TIMELINE' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
           <Calendar size={18} /> Timeline
         </button>
         <button onClick={() => { if(!user) onLogin(); else setMode('MATCH_ME'); }} className={`px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'MATCH_ME' ? 'bg-purple-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
           <Target size={18} /> Match Me
           {!user && <Lock size={12} className="ml-1" />}
         </button>
         <button onClick={() => { if(!user) onLogin(); else setMode('APPLY_READY'); }} className={`px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'APPLY_READY' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
           <FileCheck size={18} /> Apply Ready
           {!user && <Lock size={12} className="ml-1" />}
         </button>
      </div>

      {mode === 'TIMELINE' && (
        <div className="mb-8 p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-3xl animate-in slide-in-from-top-4 fade-in">
           <h3 className="text-xl font-black text-indigo-400 flex items-center gap-2 mb-2">
             <Clock className="animate-pulse" /> Funding Timeline
           </h3>
           <p className="text-sm text-gray-400">See what's over, what's open right now, and what you should be preparing for in the future. Eliminate deadline stress.</p>
        </div>
      )}

      {mode === 'MATCH_ME' && (
        <div className="mb-8 p-6 bg-purple-500/10 border border-purple-500/20 rounded-3xl animate-in slide-in-from-top-4 fade-in">
           <h3 className="text-xl font-black text-purple-400 flex items-center gap-2 mb-2">
             <Sparkles className="animate-pulse" /> Precision Matching Engine
           </h3>
           <p className="text-sm text-gray-400">Scoring logic weighs eligibility requirements against your startup's documents, age, and sector. A score above 70% indicates a strong probability of advancing past the initial review.</p>
        </div>
      )}

      {mode === 'APPLY_READY' && (
        <div className="mb-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl animate-in slide-in-from-top-4 fade-in">
           <h3 className="text-xl font-black text-emerald-400 flex items-center gap-2 mb-2">
             <ShieldCheck /> Application Readiness
           </h3>
           <p className="text-sm text-gray-400">These funding platforms guarantee rapid application assuming your vault contains CIPC and Tax Clearance documents.</p>
        </div>
      )}

      {/* Hero: Scanner for Discover mode */}
      {mode === 'DISCOVER' && (
      <div className="mb-12">
        <div className="glass-panel p-1 rounded-[2.5rem] relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500"></div>
          <div className="bg-[#050510]/80 backdrop-blur-xl rounded-[2.3rem] p-8 md:p-12 relative overflow-hidden">
             
             <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
               <div className="max-w-2xl">
                 <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight leading-none">
                   South Africa's Central <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">Funding</span> Database
                 </h2>
                 <p className="text-gray-400 text-lg leading-relaxed mb-6">
                   Instead of individual searches, we maintain a single, comprehensive, global database of active grants and loans for SMMEs and NPOs. Clean, verified, and always up-to-date.
                 </p>
                 <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-gray-400">
                   <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                     <Database size={14} className="text-purple-400" /> {opportunities.length} Listed
                   </span>
                   <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                     <Server size={14} className="text-emerald-400" /> Centrally Maintained
                   </span>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
      )}

      {/* Search and Filters */}
      <div className="sticky top-24 z-30 glass-panel p-3 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl shadow-black/30 backdrop-blur-md mb-8 border border-white/10">
        <div className="relative w-full md:w-[28rem] group">
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${isListening ? 'text-rose-400' : 'text-gray-500 group-focus-within:text-cyan-400'}`} size={18} />
          
          <input 
            type="text" 
            placeholder={isListening ? "Listening... Speak your grant query..." : "Search grants, loans, sectors, or click mic..."} 
            value={searchQueryInput}
            onChange={(e) => setSearchQueryInput(e.target.value)}
            className={`w-full bg-black/40 border rounded-xl py-3 pl-11 pr-24 text-white placeholder:text-gray-500 focus:outline-none transition-all duration-200 font-medium text-sm ${
              isListening 
                ? 'border-rose-500/70 ring-2 ring-rose-500/30 shadow-lg shadow-rose-500/10' 
                : 'border-white/10 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20'
            }`}
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searchQueryInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search input"
                title="Clear search"
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={15} />
              </button>
            )}

            <button
              type="button"
              id="funding-voice-search-mic-btn"
              onClick={toggleListening}
              aria-label={isListening ? "Stop listening" : "Search grants by speaking"}
              title={
                !isSupported 
                  ? "Voice search is not supported in this browser" 
                  : isListening 
                  ? "Listening... Click to finish voice search" 
                  : "Search grants by speaking (Voice search)"
              }
              className={`relative p-2 rounded-xl transition-all duration-200 flex items-center justify-center ${
                isListening 
                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 shadow-lg shadow-rose-500/30 scale-105' 
                  : isSupported
                  ? 'text-gray-400 hover:text-cyan-400 hover:bg-white/10 active:scale-95'
                  : 'text-gray-600 cursor-not-allowed opacity-50'
              }`}
            >
              {isListening ? (
                <>
                  <Mic size={18} className="animate-pulse text-rose-400" />
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                </>
              ) : (
                <Mic size={18} />
              )}
            </button>
          </div>
        </div>

        {/* Live Audio / Search Status and Results Count */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end text-xs">
          {isListening ? (
            <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-1.5 rounded-xl animate-pulse">
              <span className="flex gap-0.5 items-end h-3">
                <span className="w-1 bg-rose-400 rounded-full animate-bounce h-2"></span>
                <span className="w-1 bg-rose-400 rounded-full animate-bounce [animation-delay:0.15s] h-3"></span>
                <span className="w-1 bg-rose-400 rounded-full animate-bounce [animation-delay:0.3s] h-2"></span>
              </span>
              <span className="font-semibold">
                Listening... {interimText ? `"${interimText}"` : "Say e.g. 'technology grant'"}
              </span>
              <button 
                type="button" 
                onClick={stopListening} 
                className="ml-1 text-rose-300 hover:text-white underline font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-gray-400 font-medium">
              {searchQuery ? (
                <span className="flex items-center gap-1.5 text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                  Filtering for: <strong className="text-white font-bold max-w-[140px] truncate">"{searchQuery}"</strong>
                  <button 
                    type="button"
                    onClick={handleClearSearch} 
                    className="ml-1 text-gray-400 hover:text-white" 
                    title="Clear filter"
                  >
                    <X size={13} />
                  </button>
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-gray-500">
                  <Mic size={13} className="text-gray-400" />
                  Try speaking: <button type="button" onClick={() => { setSearchQueryInput('Technology'); setSearchQuery('Technology'); }} className="text-gray-400 hover:text-cyan-400 underline transition-colors">"Technology"</button> or <button type="button" onClick={() => { setSearchQueryInput('Agriculture'); setSearchQuery('Agriculture'); }} className="text-gray-400 hover:text-cyan-400 underline transition-colors">"Agriculture"</button>
                </span>
              )}
              <span className="text-gray-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 whitespace-nowrap">
                <strong className="text-white">{displayOpportunities.length}</strong> {displayOpportunities.length === 1 ? 'grant' : 'grants'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Results Grid */}
      {mode === 'TIMELINE' ? (
        <div className="space-y-16">
          {/* UPCOMING */}
          <div>
            <h3 className="text-2xl font-black mb-6 text-cyan-400 flex items-center gap-2"><Clock /> Upcoming / Prepare Now</h3>
            <div className="grid grid-cols-1 gap-6">
              {displayOpportunities.filter(o => o.item.status === 'UPCOMING').map((res, i) => (
                <FundingCard 
                  key={res.item.opportunity_id}
                  opportunity={res.item} 
                  matchScore={res.score}
                  onViewDetails={handleViewDetails}
                  onStartApplication={handleStartApplication}
                  onDownloadForm={handleDownloadForm}
                />
              ))}
              {displayOpportunities.filter(o => o.item.status === 'UPCOMING').length === 0 && (
                <p className="text-gray-500 italic p-4 bg-white/5 rounded-2xl border border-white/5">No upcoming opportunities scheduled right now.</p>
              )}
            </div>
          </div>
          {/* OPEN */}
          <div>
            <h3 className="text-2xl font-black mb-6 text-emerald-400 flex items-center gap-2"><Calendar /> Currently Open</h3>
            <div className="grid grid-cols-1 gap-6">
              {displayOpportunities.filter(o => o.item.status === 'OPEN').map((res, i) => (
                <FundingCard 
                  key={res.item.opportunity_id}
                  opportunity={res.item} 
                  matchScore={res.score}
                  onViewDetails={handleViewDetails}
                  onStartApplication={handleStartApplication}
                  onDownloadForm={handleDownloadForm}
                />
              ))}
              {displayOpportunities.filter(o => o.item.status === 'OPEN').length === 0 && (
                <p className="text-gray-500 italic p-4 bg-white/5 rounded-2xl border border-white/5">No open opportunities at this moment.</p>
              )}
            </div>
          </div>
          {/* CLOSED */}
          <div>
            <h3 className="text-2xl font-black mb-6 text-gray-500 flex items-center gap-2"><Lock /> Past Opportunities</h3>
            <div className="grid grid-cols-1 gap-6 opacity-70">
              {displayOpportunities.filter(o => o.item.status === 'CLOSED').map((res, i) => (
                <FundingCard 
                  key={res.item.opportunity_id}
                  opportunity={res.item} 
                  matchScore={res.score}
                  onViewDetails={handleViewDetails}
                  onStartApplication={handleStartApplication}
                  onDownloadForm={handleDownloadForm}
                />
              ))}
              {displayOpportunities.filter(o => o.item.status === 'CLOSED').length === 0 && (
                <p className="text-gray-500 italic p-4 bg-white/5 rounded-2xl border border-white/5">No past opportunities visible.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-6">
        {displayOpportunities.length > 0 ? (
          displayOpportunities.map((res, i) => (
            <div key={res.item.opportunity_id} className="animate-in slide-in-from-bottom flex flex-col" style={{animationDelay: `${Math.min(i, 10) * 50}ms`, animationFillMode: 'both'}}>
              <FundingCard 
                opportunity={res.item} 
                matchScore={res.score}
                onViewDetails={handleViewDetails}
                onStartApplication={handleStartApplication}
                onDownloadForm={handleDownloadForm}
              />
            </div>
          ))
        ) : (
          <div className="glass-panel p-20 text-center rounded-3xl opacity-70">
             <h4 className="text-xl font-bold mb-2">No results found</h4>
             <p className="text-gray-500">We couldn't find matches for this query or profile setup.</p>
          </div>
        )}
      </div>
      )}

      {/* Detail Modal */}
      {selectedOpp && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedOpp(null)}></div>
          <div className="relative w-full max-w-2xl bg-[#0a0a1a] border border-white/10 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setSelectedOpp(null)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-gray-500"
            >
              <X size={24} />
            </button>

            <div className="relative z-10 mb-8 pt-4">
               <h2 className="text-3xl font-black mb-2">{selectedOpp.programme_name}</h2>
               <p className="text-gray-400 text-lg">{selectedOpp.issuer_name}</p>
            </div>

            <div className="space-y-6">
               <div className="bg-white/5 p-6 rounded-2xl">
                 <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase">Eligibility</h4>
                 <p className="text-gray-300">{selectedOpp.eligibility_summary}</p>
               </div>
               
               {selectedOpp.amount_min != null && selectedOpp.amount_max != null && (
                 <div className="bg-white/5 p-6 rounded-2xl">
                   <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase">Amount</h4>
                   <p className="text-2xl font-black text-white">R{selectedOpp.amount_min.toLocaleString()} - R{selectedOpp.amount_max.toLocaleString()}</p>
                 </div>
               )}
            </div>

            <div className="mt-8 flex gap-4">
              <button 
                onClick={() => {
                  handleStartApplication(selectedOpp.opportunity_id);
                  setSelectedOpp(null);
                }}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-white font-black py-4 rounded-xl flex justify-center"
              >
                Start Application Process
              </button>
            </div>
          </div>
        </div>
      )}

      {workflowOpp && user && (
        <ApplicationWorkflow
          opportunity={workflowOpp}
          user={user}
          onClose={() => {
             setWorkflowOpp(null);
             onClearResumeOpportunity();
          }}
          onComplete={() => {
             setWorkflowOpp(null);
             onClearResumeOpportunity();
             setShowToast({show: true, message: "Application submitted!", type: "success"});
             if (toastTimer.current) clearTimeout(toastTimer.current);
             toastTimer.current = setTimeout(() => setShowToast({show: false, message: '', type: 'success'}), 4000);
             onGoToDashboard();
          }}
        />
      )}
    </div>
  );
};

export default FundingExplorer;

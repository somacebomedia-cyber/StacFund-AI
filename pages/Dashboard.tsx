
import React, { useState, useEffect } from 'react';
import { CheckCircle, Upload, Star, Trophy, FileText, Zap, Plus, Search, Clock, AlertCircle, Sparkles, Loader2, Target, ChevronRight, Info, WifiOff, AlertTriangle, XCircle, ShieldCheck, FolderOpen, ScanLine, Smartphone, Presentation, Lock, Wand2, Building } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import StatCard from '../components/StatCard';
import { MOCK_ACHIEVEMENTS, MOCK_FUNDING } from '../constants';
import { User, Application, ApplicationStatus, FundingType, AppDocument, FundingOpportunityDb, ReadinessInfo } from '../types';
import FormDigitizer from '../components/FormDigitizer';
import PresentationDesigner from '../components/PresentationDesigner';
import AILogoGenerator from '../components/AILogoGenerator';
import AdvertGenerator from '../components/AdvertGenerator';
import BusinessRegistration from '../components/BusinessRegistration';

interface DashboardProps {
  onCompleteProfile: () => void;
  onBrowseFunding: (oppId?: string, resume?: boolean, fallback?: any) => void;
  onUpgrade: () => void;
  user: User | null;
}

interface AIMatch {
  id: string;
  matchReason: string;
  score: number;
}

const Dashboard: React.FC<DashboardProps> = ({ onCompleteProfile, onBrowseFunding, onUpgrade, user }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'opportunities' | 'tools'>('overview');
  const [applications, setApplications] = useState<Application[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [aiMatches, setAiMatches] = useState<AIMatch[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessInfo | null>(null);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);
  
  const [showFormDigitizer, setShowFormDigitizer] = useState(false);
  const [showPresentationDesigner, setShowPresentationDesigner] = useState(false);
  const [showLogoGenerator, setShowLogoGenerator] = useState(false);
  const [showAdvertGenerator, setShowAdvertGenerator] = useState(false);
  const [showBusinessRegistration, setShowBusinessRegistration] = useState(false);
  const [initialAdvertPrompt, setInitialAdvertPrompt] = useState('');
  
  // Real Data Fetching
  useEffect(() => {
    const handleOpenAiTool = (event: any) => {
      const { tool, prompt } = event.detail;
      if (tool === 'logo') {
        setShowLogoGenerator(true);
      } else if (tool === 'advert') {
        if (prompt) setInitialAdvertPrompt(prompt);
        setShowAdvertGenerator(true);
      } else if (tool === 'register') {
        setShowBusinessRegistration(true);
      }
    };
    window.addEventListener('open_ai_tool', handleOpenAiTool);
    return () => window.removeEventListener('open_ai_tool', handleOpenAiTool);
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
        if (!user) return;

        try {
            // 1. Fetch Applications from Subcollection
            const appsRef = collection(db, 'users', user.id, 'applications');
            const appSnapshot = await getDocs(appsRef);
            const fetchedApps = appSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Application));
            setApplications(fetchedApps);

            // 2. Fetch Document Count
            const docsRef = collection(db, 'users', user.id, 'documents');
            const docSnapshot = await getDocs(docsRef);
            setDocCount(docSnapshot.size);

            // 3. Fetch Profile for Readiness
            const userDocRef = doc(db, 'users', user.id);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists() && userDoc.data().profile) {
                setHasProfile(true);
                const combinedProfile = {
                  ...userDoc.data().profile,
                  ownerInfo: userDoc.data().ownerInfo || {}
                };
                calculateReadiness(JSON.stringify(combinedProfile), docSnapshot.size);
            }
        } catch (e) {
            handleFirestoreError(e, OperationType.GET, `users/${user.id}`);
        }
    };

    fetchDashboardData();
  }, [user]);

  // Network Status listener
  useEffect(() => {
    const handleStatusChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  const calculateReadiness = async (profileStr: string, docs: number) => {
    if (isOffline) return;
    setIsLoadingReadiness(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Analyze this business profile and document count (${docs} docs uploaded). 
      Profile: ${profileStr}. 
      Return a JSON object with "score" (0-100) representing funding readiness and "tips" (array of 3 short strings) to improve it.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const data = JSON.parse(response.text || '{"score": 0, "tips": []}');
      setReadiness(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingReadiness(false);
    }
  };

  const runAIMatching = async () => {
    if (!user || !hasProfile || isOffline) return;
    
    setIsLoadingAI(true);
    try {
      // Re-fetch profile to ensure freshness
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const profileData = userDoc.exists() ? JSON.stringify({
        ...userDoc.data().profile,
        ownerInfo: userDoc.data().ownerInfo || {}
      }) : '';

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `
        You are a business funding expert. Analyze:
        USER PROFILE: ${profileData}
        FUNDING: ${JSON.stringify(MOCK_FUNDING)}
        Return JSON array of objects with "id", "matchReason", "score".
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const matches = JSON.parse(response.text || '[]');
      setAiMatches(matches);
    } catch (error) {
      console.error('AI Matching failed:', error);
    } finally {
      setIsLoadingAI(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'opportunities' && aiMatches.length === 0 && hasProfile) {
      runAIMatching();
    }
  }, [activeTab]);

  const handleToolClick = (tool: 'digitizer' | 'presentation' | 'logo' | 'register') => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }
    
    if (tool === 'digitizer') setShowFormDigitizer(true);
    if (tool === 'presentation') setShowPresentationDesigner(true);
    if (tool === 'logo') setShowLogoGenerator(true);
    if (tool === 'register') setShowBusinessRegistration(true);
  };

  const getStatusStyle = (status: ApplicationStatus) => {
    switch (status) {
      case ApplicationStatus.DRAFT: return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case ApplicationStatus.SUBMITTED: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case ApplicationStatus.UNDER_REVIEW: return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case ApplicationStatus.APPROVED: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case ApplicationStatus.REJECTED: return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getProgress = (status: ApplicationStatus) => {
    switch (status) {
      case ApplicationStatus.DRAFT: return 25;
      case ApplicationStatus.SUBMITTED: return 50;
      case ApplicationStatus.UNDER_REVIEW: return 75;
      case ApplicationStatus.APPROVED: return 100;
      case ApplicationStatus.REJECTED: return 100;
      default: return 0;
    }
  };

  const getProgressBarColor = (status: ApplicationStatus) => {
    switch (status) {
      case ApplicationStatus.DRAFT: return 'bg-purple-500';
      case ApplicationStatus.SUBMITTED: return 'bg-blue-500';
      case ApplicationStatus.UNDER_REVIEW: return 'bg-amber-500';
      case ApplicationStatus.APPROVED: return 'bg-emerald-500';
      case ApplicationStatus.REJECTED: return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const isPaid = user?.subscriptionPlan !== 'free';

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 relative">
      {showFormDigitizer && (
        <FormDigitizer user={user} onClose={() => setShowFormDigitizer(false)} />
      )}
      {showPresentationDesigner && (
        <PresentationDesigner user={user} onClose={() => setShowPresentationDesigner(false)} />
      )}
      {showLogoGenerator && (
        <AILogoGenerator user={user} onClose={() => setShowLogoGenerator(false)} />
      )}
      {showAdvertGenerator && (
        <AdvertGenerator user={user} onClose={() => setShowAdvertGenerator(false)} initialPrompt={initialAdvertPrompt} />
      )}
      {showBusinessRegistration && (
        <BusinessRegistration user={user} onClose={() => setShowBusinessRegistration(false)} />
      )}

      {isOffline && (
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between animate-in slide-in-from-top duration-500">
           <div className="flex items-center gap-3 text-amber-400">
             <WifiOff size={20} />
             <span className="text-sm font-bold uppercase tracking-wider">You are currently offline</span>
           </div>
           <p className="text-[10px] text-amber-400/60 font-black">LOCAL-FIRST MODE ACTIVE</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-8">
          {/* Welcome Card */}
          <div className="glass-panel rounded-3xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 blur-[60px] group-hover:bg-purple-600/20 transition-all"></div>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-3xl font-black mb-1">Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}! 👋</h2>
                <p className="text-gray-400 font-medium">{user?.businessName || 'New Entrepreneur'}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="Applications" value={applications.length} icon={<FileText size={24} />} />
            <StatCard label="Submitted" value={applications.filter(a => a.status === ApplicationStatus.SUBMITTED).length} icon={<CheckCircle size={24} />} colorClass="text-emerald-400" />
            <StatCard label="Documents" value={docCount} icon={<Upload size={24} />} colorClass="text-blue-400" />
          </div>

          <div className="glass-panel p-1.5 rounded-2xl flex overflow-x-auto hide-scrollbar gap-1">
            {['overview', 'applications', 'opportunities', 'tools'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`flex-none min-w-[110px] md:flex-1 py-3 px-4 rounded-xl font-bold capitalize transition-all text-sm ${
                  activeTab === tab ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab === 'opportunities' ? (
                  <span className="flex items-center justify-center gap-2">
                    {tab} <Sparkles size={14} className="text-cyan-400" />
                  </span>
                ) : tab}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={onCompleteProfile} className="glass-panel p-6 rounded-2xl flex items-center gap-4 hover:bg-purple-600/10 border-l-4 border-l-purple-500 transition-all text-left group">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform"><Plus size={24} /></div>
                    <div><h4 className="font-bold">Complete Profile</h4><p className="text-xs text-purple-400/80 font-bold tracking-wider">Unlock Auto-Fill</p></div>
                  </button>
                  <button onClick={() => onBrowseFunding()} className="glass-panel p-6 rounded-2xl flex items-center gap-4 hover:bg-emerald-600/10 border-l-4 border-l-emerald-500 transition-all text-left group">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform"><Search size={24} /></div>
                    <div><h4 className="font-bold">Browse Funding</h4><p className="text-xs text-emerald-400/80 font-bold tracking-wider">Find perfect match</p></div>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold">Recent Applications</h3>
                    <button onClick={() => setActiveTab('applications')} className="text-xs font-bold text-purple-400 hover:text-purple-300 uppercase tracking-wider">View All</button>
                  </div>
                  {applications.length > 0 ? (
                    applications.slice(0, 3).map(app => (
                      <div 
                        key={app.id} 
                        className={`glass-panel p-5 rounded-2xl flex items-center justify-between group hover:border-white/20 transition-all ${app.status === ApplicationStatus.DRAFT ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (app.status === ApplicationStatus.DRAFT) {
                            onBrowseFunding(app.opportunityId || app.id, true, {
                              title: app.opportunityTitle || 'Unknown Opportunity',
                              provider: app.provider || 'Unknown Provider',
                              type: app.type || FundingType.GRANT
                            });
                          }
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl">
                            {app.type === FundingType.GRANT ? '💰' : 
                             app.type === FundingType.EQUITY ? '📈' : 
                             app.type === FundingType.LOAN ? '🏦' : '🏆'}
                          </div>
                          <div><h4 className="font-bold group-hover:text-purple-400 transition-colors">{app.opportunityTitle}</h4><p className="text-xs text-gray-500">{app.provider} • {app.date}</p></div>
                        </div>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusStyle(app.status)}`}>{app.status === ApplicationStatus.DRAFT ? 'IN PROGRESS' : app.status.replace('_', ' ')}</div>
                      </div>
                    ))
                  ) : (
                    <div className="glass-panel p-16 rounded-3xl text-center opacity-50">
                      <p className="text-gray-500 font-bold">No applications yet. Start exploring funding options.</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'applications' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black">My Applications</h3>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">
                    {applications.length} Total
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {applications.length > 0 ? (
                    applications.map(app => {
                      const progress = getProgress(app.status);
                      const colorClass = getProgressBarColor(app.status);
                      
                      return (
                        <div 
                          key={app.id} 
                          className={`glass-panel p-6 rounded-3xl group hover:border-white/20 transition-all relative overflow-hidden ${app.status === ApplicationStatus.DRAFT ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (app.status === ApplicationStatus.DRAFT) {
                              onBrowseFunding(app.opportunityId || app.id, true, {
                                title: app.opportunityTitle || 'Unknown Opportunity',
                                provider: app.provider || 'Unknown Provider',
                                type: app.type || FundingType.GRANT
                              });
                            }
                          }}
                        >
                          {app.status === ApplicationStatus.REJECTED && (
                            <div className="absolute top-0 right-0 p-2 bg-red-500/20 rounded-bl-xl text-red-400 border-l border-b border-red-500/20">
                              <XCircle size={14} />
                            </div>
                          )}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                                {app.type === FundingType.GRANT ? '💰' : 
                                 app.type === FundingType.EQUITY ? '📈' : 
                                 app.type === FundingType.LOAN ? '🏦' : '🏆'}
                              </div>
                              <div>
                                <h4 className="text-lg font-bold group-hover:text-purple-400 transition-colors">{app.opportunityTitle}</h4>
                                <p className="text-xs text-gray-500 font-medium">{app.provider} • Applied on {app.date}</p>
                              </div>
                            </div>

                            <div className="flex-1 max-w-md w-full">
                              <div className="flex justify-between items-end mb-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${app.status === ApplicationStatus.REJECTED ? 'text-red-400' : 'text-gray-500'}`}>
                                  {app.status === ApplicationStatus.REJECTED ? 'Application Terminated' : 'Application Progress'}
                                </span>
                                <span className="text-xs font-bold text-gray-400">{progress}%</span>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-md ${app.status === ApplicationStatus.REJECTED ? 'bg-red-500/10 text-red-400' : 'text-white'}`}>
                                  {app.status === ApplicationStatus.DRAFT ? 'IN PROGRESS' : app.status.replace('_', ' ')}
                                </span>
                              </div>
                              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-1000 ease-out rounded-full ${colorClass} ${app.status !== ApplicationStatus.REJECTED ? 'shadow-[0_0_10px_rgba(255,255,255,0.1)]' : ''}`}
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                               {app.status === ApplicationStatus.REJECTED ? (
                                 <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20" title="Application Rejected">
                                   <AlertCircle size={20} />
                                 </div>
                               ) : app.status === ApplicationStatus.APPROVED ? (
                                 <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Funding Approved!">
                                   <Trophy size={20} />
                                 </div>
                               ) : null}
                               <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                                 <ChevronRight size={20} />
                               </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="glass-panel p-20 rounded-3xl text-center opacity-50 flex flex-col items-center gap-4">
                      <FileText size={48} className="text-gray-600" />
                      <p className="text-gray-500 font-bold">You haven't applied for any funding yet.</p>
                      <button onClick={() => onBrowseFunding()} className="text-purple-400 hover:underline font-black uppercase text-xs tracking-widest">Browse Opportunities</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'opportunities' && (
               <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-black flex items-center gap-2">AI Recommended <Sparkles size={20} className="text-cyan-400" /></h3>
                      <p className="text-gray-400 text-sm">Opportunities tailored to your business profile</p>
                    </div>
                    {hasProfile && !isLoadingAI && !isOffline && (
                      <button onClick={runAIMatching} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest flex items-center gap-1">
                        <Loader2 size={12} className={isLoadingAI ? 'animate-spin' : ''} /> Refresh Matches
                      </button>
                    )}
                  </div>

                  {!hasProfile ? (
                    <div className="glass-panel p-16 rounded-3xl text-center border-dashed border-2">
                       <Sparkles size={40} className="mx-auto text-gray-700 mb-4" />
                       <h4 className="text-xl font-bold mb-2">Unlock AI Matching</h4>
                       <p className="text-gray-500 mb-8 max-w-sm mx-auto">Complete your business profile and upload documents to see personalized funding recommendations.</p>
                       <button onClick={onCompleteProfile} className="bg-white text-black font-black px-8 py-4 rounded-2xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5">Complete Profile</button>
                    </div>
                  ) : isLoadingAI ? (
                    <div className="space-y-4">
                      {[1,2,3].map(i => (
                        <div key={i} className="glass-panel p-8 rounded-3xl h-40 animate-pulse bg-white/5"></div>
                      ))}
                    </div>
                  ) : aiMatches.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6">
                      {aiMatches.map((match: any) => {
                        const opp = MOCK_FUNDING.find(o => o.opportunity_id === match.id);
                        if (!opp) return null;
                        return (
                          <div key={opp.opportunity_id} className="glass-panel p-8 rounded-3xl relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                             <div className="absolute top-0 right-0 px-4 py-2 bg-cyan-500 text-white font-black text-[10px] uppercase tracking-widest rounded-bl-2xl">
                               {match.score}% AI Match
                             </div>
                             <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1">
                                  <h4 className="text-xl font-black mb-1 group-hover:text-cyan-400 transition-colors">{opp.programme_name}</h4>
                                  <p className="text-gray-400 text-sm mb-4">{opp.issuer_name}</p>
                                  <div className="p-4 bg-cyan-500/5 border border-cyan-500/10 rounded-2xl mb-6">
                                    <p className="text-xs text-cyan-400 leading-relaxed font-medium">
                                      <Sparkles size={12} className="inline mr-2 mb-1" />
                                      {match.matchReason}
                                    </p>
                                  </div>
                                  <div className="flex gap-4">
                                    <span className="text-xs font-bold text-gray-500 bg-white/5 px-3 py-1 rounded-lg border border-white/5">R{opp.amount_min.toLocaleString()} - R{opp.amount_max.toLocaleString()}</span>
                                    <span className="text-xs font-bold text-gray-500 bg-white/5 px-3 py-1 rounded-lg border border-white/5">{opp.funding_type}</span>
                                  </div>
                                </div>
                                <div className="flex items-center">
                                   <button onClick={() => onBrowseFunding(opp.opportunity_id)} className="w-full md:w-auto px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-cyan-500/20">View Opportunity</button>
                                </div>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="glass-panel p-16 rounded-3xl text-center">
                       <AlertTriangle size={32} className="mx-auto text-amber-500 mb-4" />
                       <p className="text-gray-500 font-bold">No matches found for your current profile. Try updating your information.</p>
                    </div>
                  )}
               </div>
            )}
            
            {activeTab === 'tools' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mb-8">
                  <h3 className="text-2xl font-black mb-2 flex items-center gap-2">Smart Tools <Zap size={20} className="text-amber-400" /></h3>
                  <p className="text-gray-400 text-sm">Utilities to bridge the gap between offline municipalities and your digital business.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* The Offline Form Filler Card */}
                  <div 
                    onClick={() => handleToolClick('digitizer')}
                    className="glass-panel p-8 rounded-[2rem] border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    {!isPaid && (
                       <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                         <div className="bg-black border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white">
                            <Lock size={12} /> Pro Feature
                         </div>
                       </div>
                    )}
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-cyan-500/20 rounded-full blur-[50px] group-hover:bg-cyan-500/30 transition-all"></div>
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/10">
                      <ScanLine size={32} />
                    </div>
                    <h4 className="text-xl font-black mb-2 group-hover:text-cyan-400 transition-colors">Offline Form Auto-Fill</h4>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                      Scan physical municipality forms with your camera. Our AI will read them and tell you exactly what to fill in based on your profile.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                       <Smartphone size={14} /> Mobile Camera Ready
                    </div>
                  </div>

                  {/* AI Presentation Designer Card */}
                  <div 
                    onClick={() => handleToolClick('presentation')}
                    className="glass-panel p-8 rounded-[2rem] border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    {!isPaid && (
                       <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                         <div className="bg-black border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white">
                            <Lock size={12} /> Pro Feature
                         </div>
                       </div>
                    )}
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-purple-500/20 rounded-full blur-[50px] group-hover:bg-purple-500/30 transition-all"></div>
                    <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-6 shadow-lg shadow-purple-500/10">
                      <Presentation size={32} />
                    </div>
                    <h4 className="text-xl font-black mb-2 group-hover:text-purple-400 transition-colors">AI Pitch Deck Designer</h4>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                      Transform boring text documents into beautiful, illustrated presentations. Perfect for printed funding proposals.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                       <Sparkles size={14} className="text-amber-400" /> Generative AI Images
                    </div>
                  </div>

                  {/* AI Logo Generator Card */}
                  <div 
                    onClick={() => handleToolClick('logo')}
                    className="glass-panel p-8 rounded-[2rem] border border-white/10 hover:border-pink-500/50 hover:bg-pink-500/5 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    {!isPaid && (
                       <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                         <div className="bg-black border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white">
                            <Lock size={12} /> Pro Feature
                         </div>
                       </div>
                    )}
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-pink-500/20 rounded-full blur-[50px] group-hover:bg-pink-500/30 transition-all"></div>
                    <div className="w-16 h-16 rounded-2xl bg-pink-500/10 text-pink-400 flex items-center justify-center mb-6 shadow-lg shadow-pink-500/10">
                      <Wand2 size={32} />
                    </div>
                    <h4 className="text-xl font-black mb-2 group-hover:text-pink-400 transition-colors">AI Logo Generator</h4>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                      Generate professional, high-quality logos for your business instantly using advanced AI image generation.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                       <Sparkles size={14} className="text-pink-400" /> Custom Branding
                    </div>
                  </div>

                  {/* Business Registration Card */}
                  <div 
                    onClick={() => handleToolClick('register')}
                    className="glass-panel p-8 rounded-[2rem] border border-white/10 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    {!isPaid && (
                       <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                         <div className="bg-black border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white">
                            <Lock size={12} /> Pro Feature
                         </div>
                       </div>
                    )}
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-orange-500/20 rounded-full blur-[50px] group-hover:bg-orange-500/30 transition-all"></div>
                    <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center mb-6 shadow-lg shadow-orange-500/10">
                      <Building size={32} />
                    </div>
                    <h4 className="text-xl font-black mb-2 group-hover:text-orange-400 transition-colors">CIPC Business Registration</h4>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                      Register your company with CIPC directly through our platform. Fast, secure, and hassle-free.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                       <Building size={14} className="text-orange-400" /> Official Integration
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:w-80 space-y-8">
          {/* AI Readiness Score Card */}
          <div className="glass-panel rounded-3xl p-6 relative overflow-hidden group">
            <div className="absolute top-[-20%] left-[-20%] w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Target size={18} className="text-cyan-400" /> Readiness Score
            </h3>
            
            {isLoadingReadiness ? (
              <div className="space-y-4 py-4">
                <div className="h-20 bg-white/5 rounded-2xl animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded w-full animate-pulse"></div>
                <div className="h-4 bg-white/5 rounded w-2/3 animate-pulse"></div>
              </div>
            ) : readiness ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * readiness.score) / 100} className="text-cyan-500 transition-all duration-1000" />
                    </svg>
                    <span className="absolute text-3xl font-black">{readiness.score}%</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><Sparkles size={12} className="text-cyan-400" /> AI Coaching Tips</p>
                  {readiness.tips.map((tip, i) => (
                    <div key={i} className="flex gap-2 items-start text-xs text-gray-400">
                      <div className="w-1 h-1 rounded-full bg-cyan-500 mt-1.5 shrink-0"></div>
                      <p>{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-gray-500 mb-4">Complete your profile to generate your AI score.</p>
                <button onClick={onCompleteProfile} className="text-xs font-bold text-cyan-400 hover:underline">Complete Profile</button>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-3xl p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6"><Star size={18} className="text-amber-400 fill-amber-400" /> Achievements</h3>
            <div className="space-y-4">
              {MOCK_ACHIEVEMENTS.map((achievement) => {
                const isCompleted = achievement.completed || 
                                   (achievement.id === 'a3' && applications.length > 0) || 
                                   (achievement.id === 'a2' && docCount >= 5) ||
                                   (achievement.id === 'a4' && applications.some(a => a.status === ApplicationStatus.APPROVED));
                
                return (
                  <div key={achievement.id} className={`p-4 rounded-2xl border transition-all ${isCompleted ? 'bg-amber-500/5 border-amber-500/20 shadow-inner' : 'bg-white/5 border-white/5 opacity-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isCompleted ? 'bg-amber-500/20 text-amber-500' : 'bg-gray-800 text-gray-500'}`}>
                        {achievement.icon === 'trophy' ? <Trophy size={18} /> : 
                         achievement.icon === 'upload' ? <Upload size={18} /> :
                         achievement.icon === 'file-text' ? <FileText size={18} /> : <Star size={18} />}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold">{achievement.title}</h4>
                        <p className="text-[10px] text-gray-500">{achievement.description}</p>
                      </div>
                      {isCompleted && <CheckCircle size={14} className="text-amber-500" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

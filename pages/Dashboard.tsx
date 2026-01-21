
import React, { useState, useEffect } from 'react';
import { CheckCircle, Upload, Star, Trophy, FileText, Zap, Plus, Search, Clock, AlertCircle, Sparkles, Loader2, Target, ChevronRight, Info, WifiOff, AlertTriangle, XCircle, ShieldCheck, FolderOpen, ScanLine, Smartphone, Presentation, Lock } from 'lucide-react';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import StatCard from '../components/StatCard';
import { MOCK_ACHIEVEMENTS, MOCK_FUNDING } from '../constants';
import { User, Application, ApplicationStatus, FundingType, AppDocument, FundingOpportunity, ReadinessInfo } from '../types';
import FormDigitizer from '../components/FormDigitizer';
import PresentationDesigner from '../components/PresentationDesigner';

interface DashboardProps {
  onCompleteProfile: () => void;
  onBrowseFunding: () => void;
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
  
  // Initialize AI once
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
  console.log(apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);

  // Real Data Fetching
  useEffect(() => {
    const fetchDashboardData = async () => {
        if (!user) return;

        try {
            const appsRef = collection(db, 'users', user.id, 'applications');
            const appSnapshot = await getDocs(appsRef);
            const fetchedApps = appSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Application));
            setApplications(fetchedApps);

            const docsRef = collection(db, 'users', user.id, 'documents');
            const docSnapshot = await getDocs(docsRef);
            setDocCount(docSnapshot.size);

            const userDocRef = doc(db, 'users', user.id);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists() && userDoc.data().profile) {
                setHasProfile(true);
                calculateReadiness(JSON.stringify(userDoc.data().profile), docSnapshot.size);
            }
        } catch (e) {
            console.error("Error fetching dashboard data", e);
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
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
      
      const prompt = `Analyze this business profile and document count (${docs} docs uploaded). 
      Profile: ${profileStr}. 
      Return a JSON object with "score" (0-100) representing funding readiness and "tips" (array of 3 short strings) to improve it.`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const data = JSON.parse(response.text() || '{"score": 0, "tips": []}');
      setReadiness(data);
    } catch (e) {
      console.error("Readiness calculation failed:", e);
    } finally {
      setIsLoadingReadiness(false);
    }
  };

  const runAIMatching = async () => {
    if (!user || !hasProfile || isOffline) return;
    
    setIsLoadingAI(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const profileData = userDoc.exists() ? JSON.stringify(userDoc.data().profile) : '';

      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
      
      const prompt = `
        You are a business funding expert. Analyze:
        USER PROFILE: ${profileData}
        FUNDING: ${JSON.stringify(MOCK_FUNDING)}
        Return JSON array of objects with "id", "matchReason", "score".
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const matches = JSON.parse(response.text() || '[]');
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

  const handleToolClick = (tool: 'digitizer' | 'presentation') => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }
    
    if (tool === 'digitizer') setShowFormDigitizer(true);
    if (tool === 'presentation') setShowPresentationDesigner(true);
  };

  const getStatusStyle = (status: ApplicationStatus) => {
    switch (status) {
      case ApplicationStatus.SUBMITTED: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case ApplicationStatus.UNDER_REVIEW: return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case ApplicationStatus.APPROVED: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case ApplicationStatus.REJECTED: return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getProgress = (status: ApplicationStatus) => {
    switch (status) {
      case ApplicationStatus.SUBMITTED: return 25;
      case ApplicationStatus.UNDER_REVIEW: return 50;
      case ApplicationStatus.APPROVED: return 100;
      case ApplicationStatus.REJECTED: return 100;
      default: return 0;
    }
  };

  const getProgressBarColor = (status: ApplicationStatus) => {
    switch (status) {
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
          <div className="glass-panel rounded-3xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 blur-[60px] group-hover:bg-purple-600/20 transition-all"></div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-3xl font-black mb-1">Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}! 👋</h2>
                <p className="text-gray-400 font-medium">{user?.businessName || 'New Entrepreneur'}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xl">
                  <Trophy size={20} /> Level 1
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Beginner Founder</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-purple-400">Progress to Level 2</span>
                <span className="text-gray-500">450 XP to go</span>
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 w-[15%] rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]"></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard label="Applications" value={applications.length} icon={<FileText size={24} />} />
            <StatCard label="Submitted" value={applications.filter(a => a.status === ApplicationStatus.SUBMITTED).length} icon={<CheckCircle size={24} />} colorClass="text-emerald-400" />
            <StatCard label="Documents" value={docCount} icon={<Upload size={24} />} colorClass="text-blue-400" />
          </div>

          <div className="glass-panel p-1 rounded-2xl flex overflow-x-auto">
            {['overview', 'applications', 'opportunities', 'tools'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`flex-1 min-w-[100px] py-3 rounded-xl font-bold capitalize transition-all ${
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
                    <div><h4 className="font-bold">Complete Profile</h4><p className="text-xs text-purple-400/80 font-bold tracking-wider">+100 XP</p></div>
                  </button>
                  <button onClick={onBrowseFunding} className="glass-panel p-6 rounded-2xl flex items-center gap-4 hover:bg-emerald-600/10 border-l-4 border-l-emerald-500 transition-all text-left group">
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
                      <div key={app.id} className="glass-panel p-5 rounded-2xl flex items-center justify-between group hover:border-white/20 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl">
                            {app.type === FundingType.GRANT ? '💰' : 
                             app.type === FundingType.EQUITY ? '📈' : 
                             app.type === FundingType.LOAN ? '🏦' : '🏆'}
                          </div>
                          <div><h4 className="font-bold group-hover:text-purple-400 transition-colors">{app.opportunityTitle}</h4><p className="text-xs text-gray-500">{app.provider} • {app.date}</p></div>
                        </div>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusStyle(app.status)}`}>{app.status.replace('_', ' ')}</div>
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
                        <div key={app.id} className="glass-panel p-6 rounded-3xl group hover:border-white/20 transition-all relative overflow-hidden">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">
                                {app.type === FundingType.GRANT ? '💰' : 
                                 app.type === FundingType.EQUITY ? '📈' : 
                                 app.type === FundingType.LOAN ? '🏦' : '🏆'}
                              </div>
                              <div>
                                <h4 className="text-lg font-bold group-hover:text-purple-400 transition-colors">{app.opportunityTitle}</h4>
                                <p className="text-xs text-gray-500">{app.provider} • {app.date}</p>
                              </div>
                            </div>
                            <div className="flex-1 max-w-md w-full">
                              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full ${colorClass}`} style={{ width: `${progress}%` }}></div>
                              </div>
                            </div>
                            <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400">
                               <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="glass-panel p-20 rounded-3xl text-center">
                      <p className="text-gray-500 font-bold">No applications found.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'opportunities' && (
               <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-black flex items-center gap-2">AI Recommended <Sparkles size={20} className="text-cyan-400" /></h3>
                    {hasProfile && !isLoadingAI && (
                      <button onClick={runAIMatching} className="text-xs font-bold text-cyan-400">Refresh Matches</button>
                    )}
                  </div>
                  {isLoadingAI ? (
                    <div className="h-40 bg-white/5 rounded-3xl animate-pulse"></div>
                  ) : aiMatches.length > 0 ? (
                    aiMatches.map((match: any) => (
                      <div key={match.id} className="glass-panel p-8 rounded-3xl border border-cyan-500/20">
                        <div className="flex justify-between mb-4">
                          <h4 className="text-xl font-black">{MOCK_FUNDING.find(o => o.id === match.id)?.title}</h4>
                          <span className="text-cyan-400 font-black">{match.score}% Match</span>
                        </div>
                        <p className="text-sm text-gray-400 mb-6">{match.matchReason}</p>
                        <button onClick={onBrowseFunding} className="bg-cyan-500 text-white px-6 py-3 rounded-xl font-bold">Apply Now</button>
                      </div>
                    ))
                  ) : (
                    <div className="glass-panel p-16 rounded-3xl text-center">
                      <p className="text-gray-500 font-bold">Complete your profile for AI matching.</p>
                    </div>
                  )}
               </div>
            )}
            
            {activeTab === 'tools' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div onClick={() => handleToolClick('digitizer')} className="glass-panel p-8 rounded-[2rem] cursor-pointer group hover:bg-cyan-500/5">
                    <ScanLine size={32} className="text-cyan-400 mb-4" />
                    <h4 className="text-xl font-black mb-2">Offline Form Auto-Fill</h4>
                    <p className="text-gray-400 text-sm">Scan physical forms to auto-fill them via AI.</p>
                  </div>
                  <div onClick={() => handleToolClick('presentation')} className="glass-panel p-8 rounded-[2rem] cursor-pointer group hover:bg-purple-500/5">
                    <Presentation size={32} className="text-purple-400 mb-4" />
                    <h4 className="text-xl font-black mb-2">AI Pitch Deck Designer</h4>
                    <p className="text-gray-400 text-sm">Convert docs into illustrated presentations.</p>
                  </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:w-80 space-y-8">
          <div className="glass-panel rounded-3xl p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6"><Target size={18} className="text-cyan-400" /> Readiness Score</h3>
            {isLoadingReadiness ? (
              <div className="h-32 bg-white/5 animate-pulse rounded-2xl"></div>
            ) : readiness ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <span className="text-3xl font-black">{readiness.score}%</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {readiness.tips.map((tip, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-400">
                      <div className="w-1 h-1 rounded-full bg-cyan-500 mt-1.5"></div>
                      <p>{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center">Calculated once profile is complete.</p>
            )}
          </div>

          <div className="glass-panel rounded-3xl p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6"><Star size={18} className="text-amber-400" /> Achievements</h3>
            <div className="space-y-4">
              {MOCK_ACHIEVEMENTS.slice(0, 3).map((a) => (
                <div key={a.id} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <h4 className="text-sm font-bold">{a.title}</h4>
                  <p className="text-[10px] text-gray-500">{a.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


import React, { useState, useEffect } from 'react';
import { Target, Bell, LayoutDashboard, Search, UserCircle, LogOut, Crown, AlertTriangle, FileText, Zap, ShieldCheck, CreditCard, ChevronRight, Menu, X, FolderOpen, ScanLine, Presentation, Wand2, MessageCircle, Building } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, isConfigured, hasValidFirebaseConfig } from './services/firebase';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import FundingExplorer from './pages/FundingExplorer';
import ProfileForm from './pages/ProfileForm';
import AuthPage from './pages/Auth';
import AIAssistant from './components/AIAssistant';
import PricingModal from './components/PricingModal';
import InstallPrompt from './components/InstallPrompt';
import NotificationsPanel from './components/NotificationsPanel';
import { User, AppNotification } from './types';

type Page = 'landing' | 'dashboard' | 'applications' | 'tools' | 'needs' | 'documents' | 'funding' | 'profile' | 'pricing' | 'auth';

const StacFundLogo = ({ size = 40 }: { size?: number }) => (
  <img 
    src="https://plain-apac-prod-public.komododecks.com/202605/18/MVQzOoGi4sCDyhKzfhaM/image.png" 
    alt="StacFund Logo" 
    referrerPolicy="no-referrer"
    style={{ width: size, height: size, objectFit: 'contain' }}
  />
);

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeOpportunityId, setActiveOpportunityId] = useState<string | null>(null);
  const [resumeOpportunityId, setResumeOpportunityId] = useState<string | null>(null);
  const [fallbackOpportunity, setFallbackOpportunity] = useState<any | null>(null);
  const [profileVersion, setProfileVersion] = useState(0); 
  const [configError, setConfigError] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      if (error) {
        const msg = (error.message || String(error)).toLowerCase();
        if (
          msg.includes('429') ||
          msg.includes('resource_exhausted') ||
          msg.includes('prepayment') ||
          msg.includes('depleted') ||
          msg.includes('quota')
        ) {
          event.preventDefault(); // Stop standard error reporting
          setQuotaError(error.message || "Your prepayment credits are depleted. Please manage your project and billing in Google AI Studio.");
        }
      }
    };

    const handleCustomQuotaError = (event: Event) => {
      const customEvent = event as CustomEvent;
      setQuotaError(customEvent.detail?.message || "Your prepayment credits are depleted. Please manage your project and billing in Google AI Studio.");
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('gemini_quota_error', handleCustomQuotaError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('gemini_quota_error', handleCustomQuotaError);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }
    const q = query(collection(db, 'users', currentUser.id, 'notifications'), where('isRead', '==', false));
    const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size));
    return () => unsub();
  }, [currentUser]);

  // Check for existing session on mount via Firebase
  useEffect(() => {
    // 1. If we have placeholder keys, do NOT attempt to connect to Firebase Auth
    // This prevents the app from hanging on the "Loading..." spinner
    if (!hasValidFirebaseConfig()) {
      console.log("Using placeholder config: Skipping Firebase Auth connection.");
      setIsInitializing(false);
      return;
    }

    // 2. Legacy check (can be kept for safety, though hasValidFirebaseConfig handles it)
    if (!isConfigured()) {
      setConfigError(true);
      setIsInitializing(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Set basic user immediately to avoid offline blocking
        setCurrentUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          businessName: 'Loading...',
          isVerified: firebaseUser.emailVerified,
          subscriptionPlan: 'free'
        });
        setCurrentPage(prev => (prev === 'landing' || prev === 'auth') ? 'dashboard' : prev);
        setIsInitializing(false);

        // Fetch extra profile data silently
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              businessName: userData.businessName || 'My Business',
              logoUrl: userData.logoUrl,
              isVerified: firebaseUser.emailVerified,
              subscriptionPlan: userData.subscriptionPlan || 'free',
              billingCycle: userData.billingCycle
            });
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
        }
      } else {
        // User is signed out
        setCurrentUser(null);
        setCurrentPage(prev => (prev !== 'landing' && prev !== 'auth') ? 'landing' : prev);
        setIsInitializing(false);
      }
    }, (error) => {
      // Handle initialization errors gracefully
      console.error("Firebase Auth Error:", error);
      setIsInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    setCurrentPage('dashboard');
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setCurrentPage('landing');
  };

  const handleProfileUpdate = () => {
    setProfileVersion(v => v + 1);
  };

  const handleUpgrade = async (plan: 'pro' | 'business', cycle: 'monthly' | 'yearly') => {
    if (!currentUser) return;
    
    const updatedUser: User = {
      ...currentUser,
      subscriptionPlan: plan,
      billingCycle: cycle
    };
    
    // The backend /api/paystack/verify route handles updating Firestore securely.
    // We just need to update the local application state.
    setCurrentUser(updatedUser);
    setCurrentPage('dashboard');
    alert(`Welcome to StacFund ${plan === 'business' ? 'Constellation' : 'Orbital'}! You are on the ${cycle} plan.`);
  };

  const handleCancelSubscription = async () => {
    if (!currentUser) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, {
        subscriptionPlan: 'free',
        billingCycle: null
      });
      
      const updatedUser: User = {
        ...currentUser,
        subscriptionPlan: 'free',
        billingCycle: undefined
      };
      setCurrentUser(updatedUser);
      alert('Your subscription has been canceled successfully.');
    } catch (error) {
      console.error("Error canceling subscription:", error);
      alert("There was an error canceling your subscription. Please try again.");
    }
  };

  const triggerPricing = () => setCurrentPage('pricing');

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return (
          <Landing 
            onGetStarted={() => setCurrentPage('auth')} 
            onLogin={() => setCurrentPage('auth')} 
            onSearchFunding={() => setCurrentPage('funding')}
          />
        );
      case 'auth':
        return (
          <AuthPage 
            onAuthSuccess={handleAuthSuccess} 
            onBack={() => setCurrentPage('landing')} 
          />
        );
      case 'pricing':
        return (
          <div className="pt-10 pb-20">
             <PricingModal 
               user={currentUser} 
               onClose={() => setCurrentPage('dashboard')} 
               onUpgrade={handleUpgrade}
             />
          </div>
        );
      case 'applications':
      case 'documents':
      case 'tools':
      case 'needs':
      case 'dashboard':
        return (
          <Dashboard 
            key={`dash-${profileVersion}-${currentUser?.subscriptionPlan}`}
            activeSection={currentPage === 'dashboard' ? 'overview' : currentPage as any}
            onNavigateToSection={(section) => setCurrentPage(section as Page)}
            onCompleteProfile={() => setCurrentPage('profile')} 
            onBrowseFunding={(oppId?: string | React.MouseEvent, resume?: boolean, fallback?: any) => {
              const id = typeof oppId === 'string' ? oppId : null;
              if (resume && id) {
                setResumeOpportunityId(id);
                setActiveOpportunityId(null);
                if (fallback) setFallbackOpportunity(fallback);
              } else if (id) {
                setActiveOpportunityId(id);
                setResumeOpportunityId(null);
                setFallbackOpportunity(null);
              } else {
                setActiveOpportunityId(null);
                setResumeOpportunityId(null);
                setFallbackOpportunity(null);
              }
              setCurrentPage('funding');
            }}
            onAvatarUpdate={(url) => setCurrentUser(prev => prev ? {...prev, logoUrl: url} : prev)}
            onUpgrade={triggerPricing}
            user={currentUser}
          />
        );
      case 'funding':
        return (
          <FundingExplorer 
            user={currentUser} 
            activeOpportunityId={activeOpportunityId}
            resumeOpportunityId={resumeOpportunityId}
            fallbackOpportunity={fallbackOpportunity}
            onGoToDashboard={() => {
              setResumeOpportunityId(null);
              setActiveOpportunityId(null);
              setFallbackOpportunity(null);
              setCurrentPage('dashboard');
            }} 
            onSetActiveOpportunity={setActiveOpportunityId}
            onClearResumeOpportunity={() => {
              setResumeOpportunityId(null);
              setFallbackOpportunity(null);
            }}
            onUpgrade={triggerPricing}
            onLogin={() => setCurrentPage('auth')}
          />
        );
      case 'profile':
        return (
          <ProfileForm 
            key={`prof-${profileVersion}`} 
            onBack={() => setCurrentPage('dashboard')} 
            user={currentUser}
            onUpgrade={triggerPricing}
            onCancelSubscription={handleCancelSubscription}
          />
        );
      default:
        return <Landing onGetStarted={() => setCurrentPage('auth')} onLogin={() => setCurrentPage('auth')} />;
    }
  };

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white/5 border border-red-500/50 p-8 rounded-3xl">
          <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Firebase Config Missing</h2>
          <p className="text-gray-400 mb-6">
            You have enabled Database mode, but you haven't set your API keys yet.
            Open <code>services/firebase.ts</code> and add your Firebase project configuration.
          </p>
          <div className="p-4 bg-black/50 rounded-xl text-left text-xs font-mono text-gray-500 overflow-x-auto">
            const firebaseConfig = &#123;<br/>
            &nbsp;&nbsp;apiKey: "YOUR_API_KEY",<br/>
            &nbsp;&nbsp;...<br/>
            &#125;
          </div>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-5">
        <img 
          src="https://plain-apac-prod-public.komododecks.com/202605/18/MVQzOoGi4sCDyhKzfhaM/image.png" 
          alt="StacFund Logo" 
          referrerPolicy="no-referrer"
          className="w-[100px] h-[100px] object-contain animate-pulse" 
          style={{ animationDuration: '2s' }}
        />
        <div className="text-gray-500 font-semibold text-sm tracking-wider">Loading StacFund...</div>
      </div>
    );
  }

  // If on landing or auth, don't show the global header or AI Assistant
  if (currentPage === 'landing' || currentPage === 'auth') {
    return (
      <>
        {renderPage()}
        <InstallPrompt />
      </>
    );
  }

  const SidebarItem = ({ icon: Icon, label, page, isActive }: { icon: any, label: string, page: Page, isActive: boolean }) => (
    <button
      onClick={() => { setCurrentPage(page); setIsMobileMenuOpen(false); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
        isActive 
          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' 
          : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
      }`}
    >
      <Icon size={18} />
      {label}
      {isActive && <ChevronRight size={16} className="ml-auto" />}
    </button>
  );

  const handleToolNavigation = (toolId: string) => {
    setCurrentPage('tools');
    setIsMobileMenuOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open_ai_tool', { detail: { tool: toolId } }));
    }, 150);
  };

  const SidebarSubItem = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 pl-4 pr-4 py-2.5 rounded-r-xl transition-all font-bold text-xs text-gray-400 hover:text-white hover:bg-white/5 border border-transparent group`}
    >
      <Icon size={16} />
      <span className="truncate">{label}</span>
      <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#050510]/95 md:bg-transparent custom-scrollbar overflow-y-auto w-full">
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => { setCurrentPage('dashboard'); setIsMobileMenuOpen(false); }}
          >
            <div className="w-10 h-10 flex items-center justify-center">
              <StacFundLogo size={32} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter">StacFund</h1>
              <p className="text-[8px] text-gray-500 uppercase tracking-[0.2em] -mt-1 font-bold">Power Your Business</p>
            </div>
          </div>
          <button 
            className="md:hidden p-2 -mr-2 text-gray-400 hover:text-white transition-colors" 
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-2 mb-8">
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2 mb-3">Mission Control</div>
          <SidebarItem icon={LayoutDashboard} label="Launchpad" page="dashboard" isActive={currentPage === 'dashboard'} />
          <SidebarItem icon={Search} label="Funding Explorer" page="funding" isActive={currentPage === 'funding'} />
          <SidebarItem icon={FileText} label="Applications" page="applications" isActive={currentPage === 'applications'} />
          <SidebarItem icon={FolderOpen} label="Documents Vault" page="documents" isActive={currentPage === 'documents'} />
        </nav>

        <nav className="space-y-2 mb-8">
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2 mb-3">Growth Tools</div>
          <SidebarItem icon={ShieldCheck} label="Compliance & Needs" page="needs" isActive={currentPage === 'needs'} />
          <SidebarItem icon={Zap} label="Smart Tools Hub" page="tools" isActive={currentPage === 'tools'} />
          
          {currentPage === 'tools' && (
            <div className="mt-1 space-y-1 border-l-2 border-white/5 ml-6 py-1">
              <SidebarSubItem icon={ScanLine} label="Offline Form Auto-Fill" onClick={() => handleToolNavigation('digitizer')} />
              <SidebarSubItem icon={Presentation} label="AI Pitch Deck" onClick={() => handleToolNavigation('presentation')} />
              <SidebarSubItem icon={Wand2} label="AI Logo Generator" onClick={() => handleToolNavigation('logo')} />
              <SidebarSubItem icon={MessageCircle} label="WhatsApp Crowdsourcer" onClick={() => handleToolNavigation('whatsapp')} />
            </div>
          )}
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-4">
        {/* Subscription Status inside Sidebar */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-gray-400">Current Plan</span>
            <div className="flex items-center gap-1">
              <Crown size={12} className={currentUser?.subscriptionPlan !== 'free' ? 'text-amber-400' : 'text-gray-500'} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${currentUser?.subscriptionPlan !== 'free' ? 'text-white' : 'text-gray-500'}`}>
                {currentUser?.subscriptionPlan === 'free' ? 'Cadet' : currentUser?.subscriptionPlan === 'business' ? 'Constellation' : 'Orbital'}
              </span>
            </div>
          </div>
          {currentUser?.subscriptionPlan === 'free' ? (
            <button 
              onClick={() => { setCurrentPage('pricing'); setIsMobileMenuOpen(false); }}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              Upgrade to Pro
            </button>
          ) : (
            <button 
              onClick={() => { setCurrentPage('pricing'); setIsMobileMenuOpen(false); }}
              className="w-full py-2 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition-colors"
             >
               Manage Plan
             </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/5">
          <button 
            onClick={() => { setCurrentPage('profile'); setIsMobileMenuOpen(false); }}
            className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity text-left"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 overflow-hidden flex items-center justify-center shrink-0">
              {currentUser?.logoUrl ? (
                <img src={currentUser.logoUrl} className="w-full h-full object-cover" alt="Logo" />
              ) : (
                <div className="text-white text-xs font-bold font-mono">
                  {(currentUser?.businessName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{currentUser?.businessName || 'My Account'}</p>
              <p className="text-[10px] text-gray-500 truncate">{currentUser?.email}</p>
            </div>
          </button>
          
          <div className="flex items-center gap-1 shrink-0 relative">
            <button 
              onClick={() => setIsNotificationsOpen(true)}
              title="Notifications"
              className="relative p-2 rounded-xl hover:bg-[#fff]/10 transition-colors text-gray-400 hover:text-[#fff]"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#050510]"></span>
              )}
            </button>
          </div>
        </div>

        {/* Prominent, easily accessible Log Out Button */}
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 font-extrabold text-xs uppercase tracking-widest transition-all duration-200 shadow-lg shadow-red-950/20"
        >
          <LogOut size={14} className="shrink-0" />
          Log Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen text-white relative flex"
      style={{ backgroundImage: "linear-gradient(rgba(5, 5, 10, 0.75), rgba(5, 5, 10, 0.75)), url('/src/assets/images/astronaut_background_png_1779097044670.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#050510', backgroundAttachment: 'fixed' }}
    >
      {/* Sidebar - Desktop */}
      <aside className="w-64 border-r border-white/5 bg-[#050510]/80 backdrop-blur-xl hidden md:flex flex-col h-screen sticky top-0 z-50">
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col h-screen hidden-scrollbar overflow-y-auto relative z-10">
        <InstallPrompt />

        {quotaError && (
          <div className="mx-6 mt-4 p-5 rounded-3xl border border-red-500/20 bg-red-950/20 backdrop-blur-md flex items-start gap-4 text-red-200 text-xs shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
            <AlertTriangle size={20} className="shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-extrabold text-[#fff] text-sm tracking-tight mb-1">AI Action Interrupted (Prepayment Limits Reached)</p>
              <p className="text-gray-300 mb-3 leading-relaxed">
                Your current Google AI Studio prepayment credits/billing limits have been depleted. Advanced features like our AI Document Digitizer, dynamic matching engines, pitch deck structures, and the AI Assistant might experience disruptions.
              </p>
              <div className="flex items-center gap-4">
                <a 
                  href="https://ai.studio/projects" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1.5 font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider text-[10px] bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-xl border border-red-500/20"
                >
                  Manage Billing in AI Studio <ChevronRight size={12} />
                </a>
                <button 
                  onClick={() => setQuotaError(null)}
                  className="text-gray-400 hover:text-white transition-colors underline uppercase tracking-wider text-[10px] font-bold"
                >
                  Dismiss Warning
                </button>
              </div>
            </div>
          </div>
        )}
        
        {isNotificationsOpen && (
          <div className="fixed inset-0 z-[100] md:absolute md:inset-auto md:right-4 md:top-4 pointer-events-none">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm md:hidden pointer-events-auto" onClick={() => setIsNotificationsOpen(false)} />
            <div className="relative pointer-events-auto w-full md:w-auto flex justify-end">
               <NotificationsPanel 
                 user={currentUser} 
                 onClose={() => setIsNotificationsOpen(false)} 
                 onNavigate={(page) => { setCurrentPage(page as Page); setIsMobileMenuOpen(false); }}
               />
            </div>
          </div>
        )}

        {/* Mobile Navigation Header */}
        <header className="md:hidden sticky top-0 z-40 bg-[#050510]/80 backdrop-blur-md border-b border-white/5 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('dashboard')}>
              <StacFundLogo size={24} />
              <h1 className="text-base font-black tracking-tighter hidden sm:block">StacFund</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsNotificationsOpen(true)} 
              className="relative p-2 rounded-full hover:bg-white/5 transition-colors text-gray-400"
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
            </button>
            <button onClick={() => setCurrentPage('profile')} className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 overflow-hidden shrink-0">
               {currentUser?.logoUrl && <img src={currentUser.logoUrl} className="w-full h-full object-cover" alt="Logo" />}
            </button>
          </div>
        </header>

        {/* Mobile Slide-out Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[100] flex">
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
              onClick={() => setIsMobileMenuOpen(false)} 
            />
            <div className="relative w-[280px] max-w-[85%] bg-[#050510] h-full shadow-2xl flex flex-col border-r border-white/10 animate-in slide-in-from-left duration-300">
              {sidebarContent}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-safe">
          {renderPage()}
        </main>

        {/* AI Assistant */}
        <AIAssistant 
          user={currentUser} 
          onNavigate={(page) => setCurrentPage(page as any)}
          onProfileUpdate={handleProfileUpdate}
        />

        {/* Simple Footer for Non-Landing Pages */}
        <footer className="py-8 border-t border-white/5 text-center text-gray-400 text-xs font-medium">
           <p>© 2026 StacFund. Level up your business.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
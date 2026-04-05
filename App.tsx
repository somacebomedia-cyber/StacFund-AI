
import React, { useState, useEffect } from 'react';
import { Target, Bell, LayoutDashboard, Search, UserCircle, LogOut, Crown, AlertTriangle } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isConfigured, hasValidFirebaseConfig } from './services/firebase';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import ProfileForm from './pages/ProfileForm';
import AuthPage from './pages/Auth';
import AIAssistant from './components/AIAssistant';
import PricingModal from './components/PricingModal';
import InstallPrompt from './components/InstallPrompt';
import { User } from './types';

type Page = 'landing' | 'dashboard' | 'marketplace' | 'profile' | 'auth';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeOpportunityId, setActiveOpportunityId] = useState<string | null>(null);
  const [resumeOpportunityId, setResumeOpportunityId] = useState<string | null>(null);
  const [profileVersion, setProfileVersion] = useState(0); 
  const [showPricing, setShowPricing] = useState(false);
  const [configError, setConfigError] = useState(false);

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
        // User is signed in, fetch extra profile data from Firestore
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              businessName: userData.businessName || 'My Business',
              isVerified: firebaseUser.emailVerified,
              subscriptionPlan: userData.subscriptionPlan || 'free',
              billingCycle: userData.billingCycle
            });
            // Only redirect to dashboard if we were on landing or auth
            setCurrentPage(prev => (prev === 'landing' || prev === 'auth') ? 'dashboard' : prev);
          } else {
            // Fallback if doc doesn't exist yet (rare race condition)
            setCurrentUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              businessName: 'New User',
              isVerified: firebaseUser.emailVerified,
              subscriptionPlan: 'free'
            });
            setCurrentPage(prev => (prev === 'landing' || prev === 'auth') ? 'dashboard' : prev);
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
        }
      } else {
        // User is signed out
        setCurrentUser(null);
        setCurrentPage(prev => (prev !== 'landing' && prev !== 'auth') ? 'landing' : prev);
      }
      setIsInitializing(false);
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

  const handleUpgrade = (plan: 'pro' | 'business', cycle: 'monthly' | 'yearly') => {
    if (!currentUser) return;
    // In a real app, you'd verify payment on backend, then update Firestore.
    // For now, we update local state + Firestore optimistically.
    const updatedUser: User = {
      ...currentUser,
      subscriptionPlan: plan,
      billingCycle: cycle
    };
    setCurrentUser(updatedUser);
    setShowPricing(false);
    alert(`Welcome to FundHub ${plan === 'business' ? 'Empire' : 'Founder Pro'}! You are on the ${cycle} plan.`);
  };

  const triggerPricing = () => setShowPricing(true);

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return (
          <Landing 
            onGetStarted={() => setCurrentPage('auth')} 
            onLogin={() => setCurrentPage('auth')} 
          />
        );
      case 'auth':
        return (
          <AuthPage 
            onAuthSuccess={handleAuthSuccess} 
            onBack={() => setCurrentPage('landing')} 
          />
        );
      case 'dashboard':
        return (
          <Dashboard 
            key={`dash-${profileVersion}-${currentUser?.subscriptionPlan}`}
            onCompleteProfile={() => setCurrentPage('profile')} 
            onBrowseFunding={(oppId?: string, resume?: boolean) => {
              if (resume && oppId) {
                setResumeOpportunityId(oppId);
              } else if (oppId) {
                setActiveOpportunityId(oppId);
              }
              setCurrentPage('marketplace');
            }}
            onUpgrade={triggerPricing}
            user={currentUser}
          />
        );
      case 'marketplace':
        return (
          <Marketplace 
            user={currentUser} 
            activeOpportunityId={activeOpportunityId}
            resumeOpportunityId={resumeOpportunityId}
            onGoToDashboard={() => {
              setResumeOpportunityId(null);
              setActiveOpportunityId(null);
              setCurrentPage('dashboard');
            }} 
            onSetActiveOpportunity={setActiveOpportunityId}
            onUpgrade={triggerPricing}
          />
        );
      case 'profile':
        return (
          <ProfileForm 
            key={`prof-${profileVersion}`} 
            onBack={() => setCurrentPage('dashboard')} 
            user={currentUser}
            onUpgrade={triggerPricing}
          />
        );
      default:
        return <Landing onGetStarted={() => setCurrentPage('auth')} onLogin={() => setCurrentPage('auth')} />;
    }
  };

  if (configError) {
    return (
      <div className="min-h-screen bg-[#050510] flex items-center justify-center p-6 text-center">
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
      <div className="min-h-screen bg-[#050510] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-purple-600 rounded-xl mb-4"></div>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Connecting to Cloud...</p>
        </div>
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

  return (
    <div className="min-h-screen bg-[#050510] text-white">
      <InstallPrompt />
      
      {showPricing && (
        <PricingModal 
          user={currentUser} 
          onClose={() => setShowPricing(false)} 
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Global Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#050510]/80 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => setCurrentPage('dashboard')}
          >
            <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Target className="text-white" size={18} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter">FundHub</h1>
              <p className="text-[8px] text-gray-500 uppercase tracking-[0.2em] -mt-1 font-bold">Power Your Business</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setCurrentPage('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                currentPage === 'dashboard' ? 'bg-white/10 text-white shadow-inner shadow-white/5' : 'text-gray-400 hover:text-white'
              }`}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
            <button 
              onClick={() => setCurrentPage('marketplace')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                currentPage === 'marketplace' ? 'bg-white/10 text-white shadow-inner shadow-white/5' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Search size={16} /> Marketplace
            </button>
          </nav>

          <div className="flex items-center gap-4">
            {currentUser?.subscriptionPlan === 'free' ? (
              <button 
                onClick={() => setShowPricing(true)}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs uppercase tracking-wider hover:scale-105 transition-transform"
              >
                <Crown size={14} /> Upgrade
              </button>
            ) : (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                 <Crown size={14} className={currentUser?.subscriptionPlan === 'business' ? 'text-amber-400' : 'text-purple-400'} />
                 <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                   {currentUser?.subscriptionPlan === 'business' ? 'Empire' : 'Founder Pro'}
                 </span>
              </div>
            )}

            <button className="relative p-2 rounded-full hover:bg-white/5 transition-colors text-gray-400">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setCurrentPage('profile')}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/5 font-bold text-sm transition-all"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500"></div>
                <span className="hidden sm:inline truncate max-w-[120px]">{currentUser?.businessName || 'My Account'}</span>
              </button>
              <button 
                onClick={handleLogout}
                title="Log Out"
                className="p-2 rounded-full hover:bg-red-500/10 transition-colors text-gray-500 hover:text-red-400"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="animate-in fade-in slide-in-from-bottom-2 duration-700">
        {renderPage()}
      </main>

      {/* AI Assistant */}
      <AIAssistant 
        user={currentUser} 
        activeOpportunityId={activeOpportunityId} 
        onNavigate={(page) => setCurrentPage(page as any)}
        onProfileUpdate={handleProfileUpdate}
      />

      {/* PWA Install Prompt */}
      <InstallPrompt />

      {/* Simple Footer for Non-Landing Pages */}
      <footer className="py-12 border-t border-white/5 text-center text-gray-600 text-xs">
         <p>© 2025 FundHub. Empowering entrepreneurs with gamified funding solutions.</p>
      </footer>
    </div>
  );
};

export default App;
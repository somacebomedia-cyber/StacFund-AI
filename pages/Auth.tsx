
import React, { useState } from 'react';
import { Target, Mail, Lock, Building2, ArrowRight, Loader2, CheckCircle2, Inbox, AlertTriangle, Zap, ShieldCheck } from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User } from '../types';

interface AuthProps {
  onAuthSuccess: (user: User) => void;
  onBack: () => void;
}

type AuthState = 'login' | 'signup' | 'verification_pending' | 'verified_success';

const Auth: React.FC<AuthProps> = ({ onAuthSuccess, onBack }) => {
  const [authState, setAuthState] = useState<AuthState>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserEmail, setPendingUserEmail] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: ''
  });

  // QUICK DEMO: Populates Firestore with a complete user environment
  const handleQuickDemo = async () => {
    setIsLoading(true);
    
    try {
      // 1. Authenticate as a Demo User
      const demoEmail = `demo.founder.${Math.floor(Math.random() * 10000)}@fundhub.test`;
      const demoPass = "demo123456";
      
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
      } catch (e) {
        throw e;
      }

      const uid = userCredential.user.uid;

      // 2. Seed User Profile
      await setDoc(doc(db, 'users', uid), {
        businessName: 'NeoTech Industries (Demo)',
        email: demoEmail,
        subscriptionPlan: 'pro',
        billingCycle: 'yearly',
        createdAt: new Date(),
        profile: {
            name: 'NeoTech Industries (Demo)',
            registration: '2023/458921/07',
            type: 'Private Company',
            industry: 'Technology',
            description: 'NeoTech specializes in providing affordable AI-driven logistics software for small courier companies in South Africa.',
            productsServices: 'Route optimization software, Driver mobile app.',
            employees: '8',
            revenue: 'R2.4M',
            years: '3',
            whatsapp: '+27 82 555 1234'
        }
      });

      // 3. Seed Documents
      const docsRef = collection(db, 'users', uid, 'documents');
      const mockDocs = [
         { name: 'CIPC_Registration_2024.pdf', type: 'application/pdf', size: 450000, uploadDate: '10 Jan 2025', category: 'General' },
         { name: 'FNB_Bank_Statements_6Months.pdf', type: 'application/pdf', size: 2500000, uploadDate: '15 Jan 2025', category: 'Financial' },
         { name: 'Tax_Clearance_Certificate.pdf', type: 'application/pdf', size: 120000, uploadDate: '20 Jan 2025', category: 'General' }
      ];
      for (const doc of mockDocs) {
          await addDoc(docsRef, doc);
      }

      // 4. Seed Applications
      const appsRef = collection(db, 'users', uid, 'applications');
      const mockApps = [
        {
          opportunityId: '1',
          opportunityTitle: 'Small Business Growth Grant 2025',
          provider: 'Global Business Foundation',
          status: 'UNDER_REVIEW',
          date: '12 Feb 2025',
          type: 'GRANT'
        },
        {
          opportunityId: '3',
          opportunityTitle: 'Women Entrepreneurs Loan Program',
          provider: 'Empowerment Bank',
          status: 'APPROVED',
          date: '28 Jan 2025',
          type: 'LOAN'
        }
      ];
      for (const app of mockApps) {
          await addDoc(appsRef, app);
      }

    } catch (err: any) {
      console.error(err);
      setError("Demo setup failed: " + err.message);
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') {
         setError('Invalid email or password.');
      } else {
         setError('Login failed: ' + err.message);
      }
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!acceptedTerms) {
      setError('You must accept the Terms & Conditions to continue.');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        businessName: formData.businessName,
        email: formData.email,
        createdAt: new Date(),
        subscriptionPlan: 'free'
      });
      
      setPendingUserEmail(formData.email);
      setAuthState('verification_pending');
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Email already in use. Please log in.');
      } else {
        setError('Signup failed: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const simulateVerification = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setAuthState('verified_success');
    setIsLoading(false);
  };

  const proceedToDashboard = () => {
      if (auth.currentUser) {
          const u: User = {
              id: auth.currentUser.uid,
              email: auth.currentUser.email || '',
              businessName: formData.businessName,
              isVerified: true,
              subscriptionPlan: 'free'
          };
          onAuthSuccess(u);
      }
  };

  if (authState === 'verification_pending') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#050510] relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in duration-500">
          <div className="glass-panel rounded-3xl p-10 border border-white/10 shadow-2xl text-center">
            <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
              <Inbox size={40} className="text-purple-400" />
            </div>
            <h2 className="text-3xl font-black mb-4">Check Your Email</h2>
            <p className="text-gray-400 mb-8 text-sm">
              We've sent a verification link to <span className="text-white font-bold">{pendingUserEmail}</span>. 
            </p>
            
            <div className="space-y-4">
              <button 
                onClick={simulateVerification}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-gray-200 active:scale-95 disabled:opacity-50 shadow-lg"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'I have verified my email'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'verified_success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#050510] relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[120px]"></div>
        <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in duration-500">
          <div className="glass-panel rounded-3xl p-10 border border-white/10 shadow-2xl text-center">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <h2 className="text-3xl font-black mb-4">Account Verified!</h2>
            <p className="text-gray-400 mb-10 text-sm">
              Your account is now fully active. You're ready to start your funding journey.
            </p>
            <button 
              onClick={proceedToDashboard}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
            >
              Go to Dashboard <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#050510] relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"></div>

      <div className="w-full max-w-md relative z-10">
        <div 
          className="flex items-center gap-3 mb-10 justify-center cursor-pointer" 
          onClick={onBack}
        >
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Target className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white">FundHub</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] -mt-1 font-bold">Power Your Business</p>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl">
          <h2 className="text-3xl font-black mb-2 text-center text-white tracking-tight">
            {authState === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-gray-500 text-center mb-8 text-sm font-medium">
            {authState === 'login' 
              ? 'Log in to manage your funding progress' 
              : 'Join a community of growing businesses'}
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider rounded-xl flex items-center gap-3">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={authState === 'login' ? handleLogin : handleSignup} className="space-y-5">
            {authState === 'signup' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] ml-1">Business Name</label>
                <div className="relative group">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                  <input 
                    required
                    type="text" 
                    placeholder="e.g., Tech Solutions" 
                    value={formData.businessName}
                    onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                <input 
                  required
                  type="email" 
                  placeholder="name@company.com" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] ml-1">Password</label>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                <input 
                  required
                  type="password" 
                  placeholder="••••••••" 
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm"
                />
              </div>
            </div>

            {authState === 'signup' && (
              <div className="flex items-start gap-3 mt-2">
                 <div className="relative flex items-center">
                    <input 
                      type="checkbox"
                      id="terms"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-white/20 bg-white/5 checked:bg-purple-600 transition-all"
                    />
                    <ShieldCheck className="pointer-events-none absolute left-0.5 top-0.5 opacity-0 peer-checked:opacity-100 text-white" size={12} />
                 </div>
                 <label htmlFor="terms" className="text-xs text-gray-500 cursor-pointer select-none">
                    I agree to the <span className="text-white font-bold hover:underline">Terms of Service</span> and <span className="text-white font-bold hover:underline">Privacy Policy</span>.
                 </label>
              </div>
            )}

            <button 
              disabled={isLoading}
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-500/20 active:scale-[0.98] disabled:opacity-70"
            >
              {isLoading && authState !== 'login' && authState !== 'signup' ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  {authState === 'login' ? 'Log In' : 'Join FundHub'} <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* QUICK DEMO BUTTON - Now using Firestore */}
            {authState === 'login' && (
               <div className="pt-2 border-t border-white/10 mt-4">
                 <button 
                   type="button"
                   onClick={handleQuickDemo}
                   disabled={isLoading}
                   className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-xs uppercase tracking-wider"
                 >
                   {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                   ⚡ Quick Demo (Cloud DB)
                 </button>
               </div>
            )}
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 font-medium">
              {authState === 'login' ? "New to FundHub?" : "Already have an account?"}
              <button 
                onClick={() => {
                  setAuthState(authState === 'login' ? 'signup' : 'login');
                  setError(null);
                }}
                className="ml-2 text-purple-400 font-black hover:underline"
              >
                {authState === 'login' ? 'Create Account' : 'Log In'}
              </button>
            </p>
          </div>
        </div>
        
        <button 
          onClick={onBack}
          className="mt-6 w-full text-center text-gray-600 text-[10px] font-black uppercase tracking-[0.2em] hover:text-gray-400 transition-colors"
        >
          Return Home
        </button>
      </div>
    </div>
  );
};

export default Auth;

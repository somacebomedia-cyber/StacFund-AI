
import React, { useState, useMemo } from 'react';
import { Target, Mail, Lock, Building2, ArrowRight, Loader2, CheckCircle2, Inbox, AlertTriangle, Zap, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, getDoc, runTransaction } from 'firebase/firestore';
import { auth, db, hasValidFirebaseConfig, handleFirestoreError, OperationType } from '../services/firebase';
import { User } from '../types';

interface AuthProps {
  onAuthSuccess: (user: User) => void;
  onBack: () => void;
}

type AuthState = 'login' | 'signup' | 'verification_pending' | 'verified_success';

const StacFundLogo = ({ size = 40 }: { size?: number }) => (
  <img 
    src="https://plain-apac-prod-public.komododecks.com/202605/18/MVQzOoGi4sCDyhKzfhaM/image.png" 
    alt="StacFund Logo" 
    referrerPolicy="no-referrer"
    style={{ width: size, height: size, objectFit: 'contain' }}
  />
);

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

  // Background stars for space theme
  const stars = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() < 0.2 ? 2 : 1,
    opacity: 0.1 + Math.random() * 0.5,
    delay: Math.random() * 5,
    duration: 3 + Math.random() * 5,
  })), []);

  const handleQuickDemo = async () => {
    setIsLoading(true);
    if (!hasValidFirebaseConfig()) {
        await new Promise(r => setTimeout(r, 1500));
        const mockUser: User = {
            id: 'demo-user-preview',
            email: 'demo.founder@stacfund.test',
            businessName: 'NeoTech Industries (Demo)',
            isVerified: true,
            subscriptionPlan: 'pro',
            billingCycle: 'yearly'
        };
        onAuthSuccess(mockUser);
        return;
    }
    
    try {
      const demoEmail = `demo.founder.${Math.floor(Math.random() * 10000)}@stacfund.test`;
      const demoPass = "demo123456";
      let userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
      const uid = userCredential.user.uid;

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

      const docsRef = collection(db, 'users', uid, 'documents');
      const mockDocs = [
         { name: 'CIPC_Registration_2024.pdf', type: 'application/pdf', size: 450000, uploadDate: '10 Jan 2025', category: 'General' },
         { name: 'FNB_Bank_Statements_6Months.pdf', type: 'application/pdf', size: 2500000, uploadDate: '15 Jan 2025', category: 'Financial' },
         { name: 'Tax_Clearance_Certificate.pdf', type: 'application/pdf', size: 120000, uploadDate: '20 Jan 2025', category: 'General' }
      ];
      for (const doc of mockDocs) {
          await addDoc(docsRef, doc);
      }

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

    if (!hasValidFirebaseConfig()) {
        await new Promise(r => setTimeout(r, 1000));
        const mockUser: User = {
            id: 'demo-user-preview',
            email: formData.email || 'user@stacfund.test',
            businessName: 'My Business (Preview)',
            isVerified: true,
            subscriptionPlan: 'free'
        };
        onAuthSuccess(mockUser);
        return;
    }

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

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      
      try {
        const uid = userCredential.user.uid;
        const userDocRef = doc(db, 'users', uid);
        const statsRef = doc(db, 'metadata', 'stats');
        
        await runTransaction(db, async (transaction) => {
          const userDoc = await transaction.get(userDocRef);
          
          if (!userDoc.exists()) {
            const statsDoc = await transaction.get(statsRef);
            let userCount = 1;
            if (statsDoc.exists()) {
              userCount = (statsDoc.data().userCount || 0) + 1;
            }
            
            transaction.set(statsRef, { userCount }, { merge: true });
            
            transaction.set(userDocRef, {
              businessName: userCredential.user.displayName || 'My Business',
              email: userCredential.user.email,
              createdAt: new Date(),
              subscriptionPlan: 'free',
              signupNumber: userCount
            });
            
            if (userCount <= 1000) {
              const notifRef = doc(collection(db, 'users', uid, 'notifications'));
              
              const getOrdinal = (n: number) => {
                const s = ["th", "st", "nd", "rd"];
                const v = n % 100;
                return (v >= 11 && v <= 13) ? "th" : (s[n % 10] || "th");
              };
              
              transaction.set(notifRef, {
                userId: uid,
                title: '🎉 Beta User Achievement Unlocked!',
                message: `Congratulations! You are the ${userCount}${getOrdinal(userCount)} early adopter to join our beta program. Thank you for your support!`,
                isRead: false,
                date: new Date().toISOString(),
                type: 'success'
              });
            }
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${userCredential.user.uid}`);
      }
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user' || err.message?.includes('popup-closed-by-user')) {
        setError('Sign-in cancelled. The Google login window was closed before completion. Please try again.');
      } else {
        setError('Google Sign-In failed: ' + err.message);
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

    if (!hasValidFirebaseConfig()) {
        await new Promise(r => setTimeout(r, 1000));
        setPendingUserEmail(formData.email);
        setAuthState('verification_pending');
        setIsLoading(false);
        return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      
      try {
        const uid = userCredential.user.uid;
        const statsRef = doc(db, 'metadata', 'stats');
        
        await runTransaction(db, async (transaction) => {
          const statsDoc = await transaction.get(statsRef);
          let userCount = 1;
          if (statsDoc.exists()) {
            userCount = (statsDoc.data().userCount || 0) + 1;
          }
          
          transaction.set(statsRef, { userCount }, { merge: true });
          
          transaction.set(doc(db, 'users', uid), {
            businessName: formData.businessName,
            email: formData.email,
            createdAt: new Date(),
            subscriptionPlan: 'free',
            signupNumber: userCount
          });
          
          if (userCount <= 1000) {
            const notifRef = doc(collection(db, 'users', uid, 'notifications'));
            
            const getOrdinal = (n: number) => {
              const s = ["th", "st", "nd", "rd"];
              const v = n % 100;
              return (v >= 11 && v <= 13) ? "th" : (s[n % 10] || "th");
            };
            
            transaction.set(notifRef, {
              userId: uid,
              title: '🎉 Beta User Achievement Unlocked!',
              message: `Congratulations! You are the ${userCount}${getOrdinal(userCount)} early adopter to join our beta program. Thank you for your support!`,
              isRead: false,
              date: new Date().toISOString(),
              type: 'success'
            });
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${userCredential.user.uid}`);
        return;
      }
      
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
      if (!hasValidFirebaseConfig()) {
        const u: User = {
            id: 'demo-user-preview',
            email: formData.email || 'demo@stacfund.test',
            businessName: formData.businessName || 'My Business',
            isVerified: true,
            subscriptionPlan: 'free'
        };
        onAuthSuccess(u);
        return;
      }

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
      <div className="min-h-screen flex items-center justify-center p-6 bg-space-auth relative overflow-hidden text-white">
        {/* <div className="absolute inset-0 bg-[#050510]/60 backdrop-blur-[2px]" /> */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.15),transparent_50%)]" />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10 glass-panel rounded-[2rem] p-10 border border-white/10 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-8 relative">
            <motion.div
               animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
               className="absolute inset-0 rounded-full bg-purple-500/20 blur-md"
            />
            <Inbox size={40} className="text-purple-400 relative z-10" />
          </div>
          <h2 className="text-3xl font-black mb-4 tracking-tight">Check Your Email</h2>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">
            We've sent a verification link to <span className="text-white font-bold">{pendingUserEmail}</span>. 
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={simulateVerification}
              disabled={isLoading}
              className="w-full bg-white text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50 shadow-xl"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'I have verified my email'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (authState === 'verified_success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-space-auth relative overflow-hidden text-white">
        {/* <div className="absolute inset-0 bg-[#050510]/60 backdrop-blur-[2px]" /> */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.15),transparent_50%)]" />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10 glass-panel rounded-[2rem] p-10 border border-white/10 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 relative">
            <motion.div
               animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
               className="absolute inset-0 rounded-full bg-emerald-500/20 blur-md"
            />
            <CheckCircle2 size={40} className="text-emerald-400 relative z-10" />
          </div>
          <h2 className="text-3xl font-black mb-4 tracking-tight">Account Verified!</h2>
          <p className="text-gray-400 mb-10 text-sm leading-relaxed">
            Your account is now fully active. You're ready to start your funding journey.
          </p>
          <button 
            onClick={proceedToDashboard}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)] active:scale-[0.98]"
          >
            Go to Mission Control <ArrowRight size={20} />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden text-white" 
      style={{ backgroundImage: "linear-gradient(rgba(5, 5, 10, 0.75), rgba(5, 5, 10, 0.75)), url('/src/assets/images/astronaut_background_png_1779097044670.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#050510' }}>
      {/* Cinematic Background */}
      <div className="absolute inset-0 z-0">
      </div>

      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        {/* Header Section */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center gap-3 mb-8 cursor-pointer group" 
          onClick={onBack}
        >
          <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}>
            <StacFundLogo size={36} />
          </motion.div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white">StacFund</h1>
          </div>
        </motion.div>

        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
          className="w-full glass-panel rounded-[2rem] p-8 sm:p-10 border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] bg-white/[0.02]"
        >
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-black mb-2 text-white tracking-tight">
              {authState === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-gray-400 text-sm font-medium">
              {authState === 'login' 
                ? 'Log in to manage your funding progress' 
                : 'Join a community of growing businesses'}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider rounded-xl flex items-center gap-3"
            >
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={authState === 'login' ? handleLogin : handleSignup} className="space-y-4">
            {authState === 'signup' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Business Name</label>
                <div className="relative group">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                  <input 
                    required
                    type="text" 
                    name="businessName"
                    id="businessName"
                    autoComplete="org"
                    placeholder="e.g., Tech Solutions" 
                    value={formData.businessName}
                    onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all text-sm shadow-inner"
                  />
                  <div className="absolute inset-0 rounded-xl pointer-events-none border border-transparent group-focus-within:border-purple-500/30 group-focus-within:shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all" />
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                <input 
                  required
                  type="email" 
                  name="email"
                  id="email"
                  autoComplete="email"
                  placeholder="name@company.com" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all text-sm shadow-inner"
                />
                <div className="absolute inset-0 rounded-xl pointer-events-none border border-transparent group-focus-within:border-purple-500/30 group-focus-within:shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-400 transition-colors" size={18} />
                <input 
                  required
                  type="password" 
                  name="password"
                  id="password"
                  autoComplete={authState === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••" 
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all text-sm shadow-inner"
                />
                <div className="absolute inset-0 rounded-xl pointer-events-none border border-transparent group-focus-within:border-purple-500/30 group-focus-within:shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all" />
              </div>
            </div>

            {authState === 'signup' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-start gap-3 mt-4 mb-2">
                 <div className="relative flex items-center mt-0.5">
                    <input 
                      type="checkbox"
                      id="terms"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded-md border border-white/20 bg-black/40 checked:bg-purple-600 checked:border-purple-500 transition-all"
                    />
                    <ShieldCheck className="pointer-events-none absolute left-[1px] top-[1px] opacity-0 peer-checked:opacity-100 text-white" size={14} />
                 </div>
                 <label htmlFor="terms" className="text-xs text-gray-400 cursor-pointer select-none leading-relaxed">
                    I agree to the <span className="text-white hover:text-purple-400 transition-colors">Terms of Service</span> and <span className="text-white hover:text-purple-400 transition-colors">Privacy Policy</span>.
                 </label>
              </motion.div>
            )}

            <button 
              disabled={isLoading}
              type="submit"
              className="mt-6 w-full relative bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)] active:scale-[0.98] disabled:opacity-70 group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[150%] animate-[shimmer_3s_infinite] transition-all" />
              {isLoading && authState !== 'login' && authState !== 'signup' ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <span className="relative z-10">{authState === 'login' ? 'Log In' : 'Join StacFund'}</span> 
                  <ArrowRight size={18} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-gray-500 text-[10px] font-bold uppercase tracking-widest">Or</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-70 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <svg className="w-5 h-5 relative z-10" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="relative z-10 text-sm">Continue with Google</span>
            </button>

            {/* QUICK DEMO BUTTON - Now using Firestore */}
            {authState === 'login' && (
               <div className="pt-2 mt-4 text-center">
                 <button 
                   type="button"
                   onClick={handleQuickDemo}
                   disabled={isLoading}
                   className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors py-2 px-4 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 group"
                 >
                   {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="group-hover:scale-110 transition-transform" />}
                   Quick Demo (Cloud DB)
                 </button>
               </div>
            )}
          </form>

          <div className="mt-8 text-center bg-white/[0.02] -mx-8 sm:-mx-10 -mb-8 sm:-mb-10 p-6 border-t border-white/5 rounded-b-[2rem]">
            <p className="text-sm text-gray-400">
              {authState === 'login' ? "New to StacFund?" : "Already have an account?"}
              <button 
                onClick={() => {
                  setAuthState(authState === 'login' ? 'signup' : 'login');
                  setError(null);
                }}
                className="ml-2 text-white font-bold hover:text-purple-400 transition-colors"
              >
                {authState === 'login' ? 'Create Account' : 'Log In'}
              </button>
            </p>
          </div>
        </motion.div>
        
        <motion.button 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={onBack}
          className="mt-8 relative group py-2 px-6 overflow-hidden rounded-full font-black text-[10px] uppercase tracking-[0.2em] text-gray-500 hover:text-white transition-colors"
        >
          <span className="relative z-10">Return Home</span>
          <div className="absolute inset-0 bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </motion.button>
      </div>
    </div>
  );
};

export default Auth;

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Rocket, Building2, ShieldCheck, Target, ArrowRight, X,
  Users, Banknote, MapPin, Upload, CheckCircle2, Loader2,
} from 'lucide-react';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../services/firebase';
import { triggerConfetti } from '../utils/confettiHelper';
import type { User } from '../types';

const INDUSTRIES = [
  'Agriculture', 'Retail & E-commerce', 'Manufacturing', 'Technology & Software',
  'Tourism & Hospitality', 'Construction', 'Professional Services', 'Health & Wellness',
  'Creative & Media', 'Transport & Logistics', 'Education', 'Other',
];

const STAGES = [
  { id: 'idea', label: 'Idea Stage', desc: 'Pre-revenue, validating', icon: Target },
  { id: 'startup', label: 'Startup', desc: '0-2 years, early revenue', icon: Rocket },
  { id: 'growth', label: 'Growth', desc: '2-5 years, scaling', icon: Building2 },
  { id: 'established', label: 'Established', desc: '5+ years, stable', icon: ShieldCheck },
];

const EMPLOYEE_BANDS = ['Just me', '2-5', '6-20', '21-50', '51+'];
const REVENUE_BANDS = ['Pre-revenue', 'Under R100k', 'R100k - R1m', 'R1m - R5m', 'R5m+'];
const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
];

const TOTAL_STEPS = 4; // 0=welcome, 1=basics, 2=compliance, 3=first win

interface OnboardingWizardProps {
  user: User;
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingWizard({ user, onComplete, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const [businessInfo, setBusinessInfo] = useState({
    name: user.businessName || '',
    industry: '',
    stage: '',
    employees: '',
    revenue: '',
    province: '',
  });

  const [compliance, setCompliance] = useState({
    hasBankAccount: false,
    hasSarsTax: false,
    hasCipcRegistration: false,
    hasBeeCert: false,
    hasIdDocs: false,
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
  const handleBack = () => setStep(s => Math.max(s - 1, 0));

  const toggleCompliance = (key: keyof typeof compliance) => {
    setCompliance(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (f.size > MAX_SIZE) {
      setUploadError('File is too large (max 10MB).');
      return;
    }
    setUploadError(null);
    setUploadedFile(f);
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'businessProfiles', user.id), {
        user_id: user.id,
        business_status: businessInfo.stage,
        entity_type: 'Not specified',
        industry: businessInfo.industry,
        location: businessInfo.province,
        revenue_band: businessInfo.revenue,
        staff_count: 0,
        has_bank_account: compliance.hasBankAccount,
        has_sars_tax: compliance.hasSarsTax,
        has_cipc_registration: compliance.hasCipcRegistration,
        age: 0,
        documents_ready: Object.entries(compliance).filter(([, v]) => v).map(([k]) => k),
        businessName: businessInfo.name,
        employees: businessInfo.employees,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (uploadedFile) {
        try {
          const storage = getStorage();
          const safeName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `users/${user.id}/documents/${Date.now()}_${safeName}`;
          const fileRef = ref(storage, storagePath);

          await uploadBytes(fileRef, uploadedFile, {
            contentType: uploadedFile.type || 'application/octet-stream',
          });
          const downloadUrl = await getDownloadURL(fileRef);

          await addDoc(collection(db, 'users', user.id, 'documents'), {
            userId: user.id,
            name: uploadedFile.name,
            type: uploadedFile.type || 'application/octet-stream',
            size: uploadedFile.size,
            storagePath,
            url: downloadUrl,
            uploadDate: new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }),
            category: 'General',
            uploadedViaOnboarding: true,
            createdAt: serverTimestamp(),
          });
        } catch (uploadErr) {
          console.error('[OnboardingWizard] Document upload failed:', uploadErr);
          await addDoc(collection(db, 'users', user.id, 'documents'), {
            userId: user.id,
            name: uploadedFile.name,
            type: uploadedFile.type || 'application/octet-stream',
            size: uploadedFile.size,
            uploadDate: new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }),
            category: 'General',
            uploadedViaOnboarding: true,
            uploadFailed: true,
            createdAt: serverTimestamp(),
          });
        }
      }

      await setDoc(doc(db, 'users', user.id), {
        onboardingComplete: true,
      }, { merge: true });

      triggerConfetti();
      onComplete();
    } catch (e) {
      console.error('[OnboardingWizard] Failed to save onboarding data:', e);
      onComplete();
    } finally {
      setIsSaving(false);
    }
  };

  const complianceCount = Object.values(compliance).filter(Boolean).length;
  const readinessPct = Math.round((complianceCount / 5) * 100);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden text-white"
      style={{ backgroundImage: "linear-gradient(rgba(5, 5, 10, 0.85), rgba(5, 5, 10, 0.85)), url('/assets/images/astronaut-bg.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#050510' }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.15),transparent_50%)]" />

      <button
        onClick={onSkip}
        className="absolute top-6 right-6 z-20 text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1"
      >
        Skip for now <X size={14} />
      </button>

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
        className="w-full max-w-2xl relative z-10 glass-panel rounded-[2rem] border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] bg-white/[0.02] overflow-hidden"
      >
        {step > 0 && step < TOTAL_STEPS && (
          <div className="px-8 pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                Step {step} of {TOTAL_STEPS - 1}
              </span>
              <span className="text-[10px] font-bold text-gray-500">
                {step === 1 ? 'Business Basics' : step === 2 ? 'Compliance Pulse' : 'First Win'}
              </span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-600 to-indigo-600"
                initial={{ width: 0 }}
                animate={{ width: `${((step - 1) / (TOTAL_STEPS - 2)) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        )}

        <div className="p-8 sm:p-10">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                  className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(139,92,246,0.4)]"
                >
                  <Rocket size={36} className="text-white" />
                </motion.div>
                <h1 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">
                  Welcome to StacFund, {user.businessName?.split(' ')[0] || 'Founder'}!
                </h1>
                <p className="text-gray-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
                  Let's get you funding-ready in <span className="text-purple-400 font-bold">3 minutes</span>.
                  We'll set up your profile, check your compliance, and unlock your first matched opportunities.
                </p>

                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[
                    { icon: Building2, label: 'Profile', color: 'text-purple-400' },
                    { icon: ShieldCheck, label: 'Compliance', color: 'text-emerald-400' },
                    { icon: Target, label: 'First Win', color: 'text-pink-400' },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-center"
                    >
                      <item.icon size={24} className={`mx-auto mb-2 ${item.color}`} />
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{item.label}</span>
                    </motion.div>
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)] active:scale-[0.98]"
                >
                  Let's Go <ArrowRight size={20} />
                </button>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="basics"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-2xl font-black mb-1 tracking-tight">Tell us about your business</h2>
                <p className="text-gray-500 text-sm mb-6">This powers your funding matches.</p>

                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Business Name</label>
                    <input
                      type="text"
                      value={businessInfo.name}
                      onChange={e => setBusinessInfo({ ...businessInfo, name: e.target.value })}
                      placeholder="e.g., NeoTech Industries"
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Industry</label>
                    <select
                      value={businessInfo.industry}
                      onChange={e => setBusinessInfo({ ...businessInfo, industry: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-purple-500/50 transition-all text-sm"
                    >
                      <option value="">Select industry…</option>
                      {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Business Stage</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STAGES.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setBusinessInfo({ ...businessInfo, stage: s.id })}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            businessInfo.stage === s.id
                              ? 'bg-purple-600/20 border-purple-500/50'
                              : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                          }`}
                        >
                          <s.icon size={18} className={businessInfo.stage === s.id ? 'text-purple-400' : 'text-gray-500'} />
                          <div className="text-xs font-bold mt-1.5">{s.label}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><Users size={10} /> Team Size</label>
                      <select
                        value={businessInfo.employees}
                        onChange={e => setBusinessInfo({ ...businessInfo, employees: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-3 text-white focus:outline-none focus:border-purple-500/50 transition-all text-sm"
                      >
                        <option value="">Select…</option>
                        {EMPLOYEE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><Banknote size={10} /> Revenue</label>
                      <select
                        value={businessInfo.revenue}
                        onChange={e => setBusinessInfo({ ...businessInfo, revenue: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-3 text-white focus:outline-none focus:border-purple-500/50 transition-all text-sm"
                      >
                        <option value="">Select…</option>
                        {REVENUE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><MapPin size={10} /> Province</label>
                    <select
                      value={businessInfo.province}
                      onChange={e => setBusinessInfo({ ...businessInfo, province: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-purple-500/50 transition-all text-sm"
                    >
                      <option value="">Select province…</option>
                      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={handleBack} className="px-5 py-3.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm font-bold">
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!businessInfo.name || !businessInfo.industry || !businessInfo.stage}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    Continue <ArrowRight size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="compliance"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-2xl font-black mb-1 tracking-tight">Compliance Pulse</h2>
                <p className="text-gray-500 text-sm mb-6">What documents do you have ready? We'll track your readiness score.</p>

                <div className="space-y-3 mb-6">
                  {[
                    { key: 'hasBankAccount', label: 'Business Bank Account' },
                    { key: 'hasSarsTax', label: 'SARS Tax Clearance' },
                    { key: 'hasCipcRegistration', label: 'CIPC Registration' },
                    { key: 'hasBeeCert', label: 'B-BBEE Affidavit' },
                    { key: 'hasIdDocs', label: 'Director ID Copies' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(compliance as any)[item.key]}
                        onChange={() => toggleCompliance(item.key as any)}
                        className="w-5 h-5 rounded border-gray-600 bg-black/40 checked:bg-purple-500 checked:border-purple-500 focus:ring-purple-500/50"
                      />
                      <span className="text-sm font-medium">{item.label}</span>
                    </label>
                  ))}
                </div>

                <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/20 rounded-xl p-4 flex items-center justify-between mb-6">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estimated Readiness</div>
                    <div className="text-xl font-black text-white">{readinessPct}%</div>
                  </div>
                  <div className="h-12 w-12 rounded-full border-4 border-white/5 relative flex items-center justify-center">
                    <svg className="absolute inset-0 -rotate-90 w-full h-full text-purple-500">
                      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={`${(readinessPct / 100) * 113} 113`} />
                    </svg>
                    <Target size={16} className="text-purple-400" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleBack} className="px-5 py-3.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm font-bold">
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    Continue <ArrowRight size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="firstWin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-2xl font-black mb-1 tracking-tight">Your First Win</h2>
                <p className="text-gray-500 text-sm mb-6">Upload your CIPC certificate or ID. We'll store it securely in your vault.</p>

                <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center bg-white/[0.01] hover:bg-white/[0.03] transition-colors relative">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {!uploadedFile ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                        <Upload size={28} className="text-purple-400" />
                      </div>
                      <h3 className="text-lg font-bold mb-1">Tap to upload document</h3>
                      <p className="text-xs text-gray-500">PDF, JPG, or PNG (Max 10MB)</p>
                      {uploadError && <p className="text-red-400 text-sm mt-2">{uploadError}</p>}
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                        <CheckCircle2 size={28} className="text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-bold mb-1 text-emerald-400">Ready to upload</h3>
                      <p className="text-sm font-mono text-gray-300 truncate max-w-[200px] mx-auto">{uploadedFile.name}</p>
                      <p className="text-xs text-gray-500 mt-2">Tap to change</p>
                    </>
                  )}
                </div>

                <div className="flex gap-3 mt-8">
                  <button onClick={handleBack} disabled={isSaving} className="px-5 py-3.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm font-bold disabled:opacity-50">
                    Back
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={isSaving}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-70 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : 'Complete Setup'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

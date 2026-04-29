import React, { useState } from 'react';
import { X, Building, Loader2, CheckCircle, FileText, ChevronRight, AlertCircle, UploadCloud } from 'lucide-react';
import { User } from '../types';

interface BusinessRegistrationProps {
  user: User | null;
  onClose: () => void;
}

const BusinessRegistration: React.FC<BusinessRegistrationProps> = ({ user, onClose }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    nameOption1: '',
    nameOption2: '',
    nameOption3: '',
    nameOption4: '',
    directorName: user?.fullName || '',
    directorId: '',
    physicalAddress: '',
  });

  const handleSubmit = async () => {
    setIsLoading(true);
    // Simulate CIPC API / Legal Processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsLoading(false);
    setIsSuccess(true);
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2rem] w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Building size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Business Registration Wizard</h2>
              <p className="text-sm text-gray-400">Integrated with CIPC Systems</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 overflow-y-auto">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                <CheckCircle size={48} className="text-emerald-400" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Registration Submitted!</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-8">
                Your company registration request and name reservations have been submitted securely. You will receive official documentation via email once approved.
              </p>
              <button 
                onClick={onClose}
                className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Stepper */}
              <div className="flex items-center justify-between mb-8">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-orange-400' : 'text-gray-600'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-orange-500 text-black' : 'bg-white/10'}`}>1</div>
                  <span className="text-sm font-bold hidden sm:block">Name Reservation</span>
                </div>
                <div className={`h-px flex-1 mx-4 ${step >= 2 ? 'bg-orange-500/50' : 'bg-white/10'}`}></div>
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-orange-400' : 'text-gray-600'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-orange-500 text-black' : 'bg-white/10'}`}>2</div>
                  <span className="text-sm font-bold hidden sm:block">Company Details</span>
                </div>
                <div className={`h-px flex-1 mx-4 ${step >= 3 ? 'bg-orange-500/50' : 'bg-white/10'}`}></div>
                <div className={`flex items-center gap-2 ${step >= 3 ? 'text-orange-400' : 'text-gray-600'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 3 ? 'bg-orange-500 text-black' : 'bg-white/10'}`}>3</div>
                  <span className="text-sm font-bold hidden sm:block">Review & Submit</span>
                </div>
              </div>

              {/* Step 1: Names */}
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl flex gap-3 text-orange-200 text-sm">
                    <AlertCircle size={20} className="shrink-0 text-orange-400" />
                    <p>CIPC requires up to 4 name choices in order of preference. We will register the first one that is available.</p>
                  </div>
                  
                  {[1, 2, 3, 4].map((num) => (
                    <div key={num}>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Choice {num}</label>
                      <input 
                        type="text"
                        value={(formData as any)[`nameOption${num}`]}
                        onChange={(e) => setFormData({...formData, [`nameOption${num}`]: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        placeholder={`e.g. ${user?.fullName?.split(' ')[0] || 'Fast'} Enterprises (Pty) Ltd`}
                      />
                    </div>
                  ))}

                  <button 
                    onClick={handleNext}
                    disabled={!formData.nameOption1}
                    className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 mt-8 disabled:opacity-50"
                  >
                    Continue to Details <ChevronRight size={20} />
                  </button>
                </div>
              )}

              {/* Step 2: Details */}
              {step === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Director Full Name</label>
                    <input 
                      type="text"
                      value={formData.directorName}
                      onChange={(e) => setFormData({...formData, directorName: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Director ID Number</label>
                    <input 
                      type="text"
                      value={formData.directorId}
                      onChange={(e) => setFormData({...formData, directorId: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                      placeholder="13-digit SA ID Number"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Company Physical Address</label>
                    <textarea 
                      value={formData.physicalAddress}
                      onChange={(e) => setFormData({...formData, physicalAddress: e.target.value})}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                      placeholder="Full street address..."
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleNext}
                      disabled={!formData.directorId || !formData.physicalAddress}
                      className="flex-[2] py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      Review Registration <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {step === 3 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Registration Summary</h4>
                    
                    <div className="space-y-3 mb-6 pb-6 border-b border-white/10 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Name Choice 1</span>
                        <span className="text-white font-bold">{formData.nameOption1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Director</span>
                        <span className="text-white font-bold">{formData.directorName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">ID Number</span>
                        <span className="text-white font-bold">{formData.directorId}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-gray-400 mb-2">
                       <FileText size={16} className="text-orange-400"/> Includes CoR 14.1 & CoR 15.1A
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400 mb-2">
                       <UploadCloud size={16} className="text-emerald-400"/> Direct API Submission
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => setStep(2)}
                      disabled={isLoading}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleSubmit}
                      disabled={isLoading}
                      className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <><Loader2 size={20} className="animate-spin" /> Submitting to CIPC...</>
                      ) : (
                        <><CheckCircle size={20} /> Confirm & Register</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessRegistration;

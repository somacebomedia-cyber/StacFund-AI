import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckCircle2, Clock, CalendarDays, Rocket, Info, ArrowRight, Activity, Download, ArrowUpRight } from 'lucide-react';
import { ApplicationStatus, Application } from '../types';

const TrackerLogo = ({ app }: { app: Application }) => {
  const [fallbackStage, setFallbackStage] = useState(0);

  const domain = useMemo(() => {
    try {
      if (app.logoUrl && app.logoUrl.includes('clearbit.com/')) {
        return app.logoUrl.split('clearbit.com/')[1].split('?')[0];
      }
      return null;
    } catch {
      return null;
    }
  }, [app.logoUrl]);

  const currentUrl = useMemo(() => {
    if (fallbackStage === 0 && app.logoUrl) {
      return app.logoUrl;
    }
    if (fallbackStage <= 1 && domain) {
      return `https://logo.clearbit.com/${domain}`;
    }
    return null;
  }, [app.logoUrl, domain, fallbackStage]);

  if (currentUrl) {
    return (
      <div className="w-12 h-12 rounded-2xl bg-[#111] overflow-hidden flex items-center justify-center text-xl border border-white/10 shrink-0">
        <img 
          src={currentUrl} 
          alt={app.provider} 
          className="w-full h-full object-contain p-1.5 bg-white" 
          onError={() => setFallbackStage(prev => prev + 1)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className="w-12 h-12 rounded-2xl bg-[#111] overflow-hidden flex items-center justify-center text-xl border border-white/10 shrink-0">
      {app.type === 'GRANT' ? '💰' : 
       app.type === 'EQUITY' ? '📈' : 
       app.type === 'LOAN' ? '🏦' : '🏆'}
    </div>
  );
};

interface ApplicationTrackerProps {
  application: Application;
  onClose: () => void;
}

export const ApplicationTracker: React.FC<ApplicationTrackerProps> = ({ application, onClose }) => {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Determine stage based on status
  let currentStageIndex = 0;
  
  if (application.status === ApplicationStatus.DRAFT) {
    currentStageIndex = 0; // Not submitted
  } else if (application.status === ApplicationStatus.SUBMITTED) {
    currentStageIndex = 1;
  } else if (application.status === ApplicationStatus.REVIEWING) {
    currentStageIndex = 2;
  } else if (application.status === ApplicationStatus.APPROVED) {
    currentStageIndex = 4;
  } else if (application.status === ApplicationStatus.REJECTED) {
    currentStageIndex = -1; // Special case
  } else if (application.status === ApplicationStatus.FUNDED) {
    currentStageIndex = 5;
  }

  // Calculate dates based on submission date
  const submitDateStr = application.date;
  const submitDate = new Date(submitDateStr);
  const isValidDate = !isNaN(submitDate.getTime());
  
  // Use today if date parsing fails (fallback)
  const baseDate = isValidDate ? submitDate : new Date();

  const isDirect = application.submissionMethod === 'DIRECT_API';
  
  // Timelines (Direct vs Manual)
  // Direct: Response 1-2 weeks, Funding 2-3 weeks post-approval
  // Manual: Response 3-4 weeks, Funding 4-6 weeks post-approval
  
  const initialReviewDate = new Date(baseDate);
  initialReviewDate.setDate(baseDate.getDate() + (isDirect ? 7 : 14));
  
  const decisionDate = new Date(baseDate);
  decisionDate.setDate(baseDate.getDate() + (isDirect ? 21 : 35));
  
  const payoutDate = new Date(decisionDate);
  payoutDate.setDate(decisionDate.getDate() + (isDirect ? 14 : 30));

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const steps = [
    {
      title: "Application Received",
      description: "Securely received by the institution.",
      date: formatDate(baseDate),
      icon: CheckCircle2,
      active: currentStageIndex >= 1,
      current: currentStageIndex === 1
    },
    {
      title: "Initial Processing",
      description: "Document verification and compliance checks.",
      date: `Est. ${formatDate(initialReviewDate)}`,
      icon: Activity,
      active: currentStageIndex >= 2,
      current: currentStageIndex === 2
    },
    {
      title: "Board Decision",
      description: "Final review and outcome notification.",
      date: `Est. ${formatDate(decisionDate)}`,
      icon: Clock,
      active: currentStageIndex >= 3,
      current: currentStageIndex === 3
    },
    {
      title: "Funding Disbursement",
      description: "Funds transferred to your registered account.",
      date: `Est. ${formatDate(payoutDate)}`,
      icon: Rocket,
      active: currentStageIndex >= 4,
      current: currentStageIndex === 4
    }
  ];

  if (application.status === ApplicationStatus.REJECTED) {
    // Modify timeline for rejected state
    steps[2].title = "Decision Rendered";
    steps[2].description = "Application was not successful at this time.";
    steps[2].active = true;
    steps[2].current = true;
    steps[3].active = false;
    currentStageIndex = 2; // stop at decision
  }

  useEffect(() => {
    // Animate progress bar fill
    const targetProgress = (Math.max(0, currentStageIndex) / (steps.length - 1)) * 100;
    setTimeout(() => {
      setAnimatedProgress(targetProgress);
    }, 100);
  }, [currentStageIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div 
        className="bg-[#0a0a0a] border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <TrackerLogo app={application} />
            <div>
              <h2 className="text-xl font-bold">{application.opportunityTitle}</h2>
              <p className="text-sm text-gray-400 font-medium">{application.provider}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          
          <div className="mb-10 text-center">
            <h3 className="text-3xl font-black mb-3">Application Tracker</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
              Real-time progression of your submission based on {application.provider}'s standard processing timelines.
            </p>
          </div>

          {/* Special Indicator for Direct Connect */}
          {isDirect && (
            <div className="mb-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-4">
              <div className="p-2 bg-amber-500/20 rounded-xl shrink-0">
                <Rocket className="text-amber-400" size={20} />
              </div>
              <div>
                <h4 className="text-amber-400 font-bold mb-1">Direct Connect Fast-Track Active</h4>
                <p className="text-sm text-amber-400/80 leading-relaxed">
                  You submitted this application directly via StacFund API. The timelines below reflect the accelerated processing speed specific to direct system-to-system submissions.
                </p>
              </div>
            </div>
          )}

          {/* Timeline visualization */}
          <div className="relative mb-12">
            {/* The line */}
            <div className="absolute top-0 bottom-0 left-[23px] w-0.5 bg-white/10 z-0"></div>
            {/* Animated filled line */}
            <div 
              className="absolute top-0 left-[23px] w-0.5 bg-purple-500 z-0 transition-all duration-1000 ease-in-out"
              style={{ height: `${animatedProgress}%` }}
            ></div>

            <div className="space-y-12 relative z-10">
              {steps.map((step, index) => {
                const isPast = index < currentStageIndex;
                const Icon = step.icon;
                
                return (
                  <div key={index} className={`flex gap-6 ${!step.active && !step.current ? 'opacity-40' : ''}`}>
                    <div className="flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 border-[#0a0a0a] transition-all duration-500 ${
                        step.current 
                          ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-110' 
                          : step.active 
                            ? 'bg-white text-black' 
                            : 'bg-white/10 text-gray-500'
                      }`}>
                        <Icon size={20} strokeWidth={step.current || step.active ? 3 : 2} />
                      </div>
                    </div>
                    
                    <div className="pt-2 flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <h4 className={`text-lg font-bold ${step.current ? 'text-purple-400' : step.active ? 'text-white' : 'text-gray-500'}`}>
                          {step.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-gray-500 bg-white/5 px-2.5 py-1 rounded-md w-fit">
                          <CalendarDays size={12} />
                          {step.date}
                        </div>
                      </div>
                      <p className={`text-sm leading-relaxed ${step.current ? 'text-gray-300' : 'text-gray-500'}`}>
                        {step.description}
                      </p>
                      
                      {step.current && index === 1 && (
                        <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Awaiting Update</span>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2">
                            The institution's compliance team is reviewing the digital pack. We will notify you via email standardly when status transitions.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-4">
            <Info className="text-gray-400 shrink-0 mt-0.5" size={20} />
            <p className="text-xs text-gray-400 leading-relaxed">
              Timelines are estimates based on standard processing times. Exact times vary depending on the funding institution's internal review processes and volume of applications.
            </p>
          </div>

        </div>
        
        <div className="p-6 border-t border-white/5 bg-white/[0.02]">
          <button 
            onClick={onClose}
            className="w-full relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-white px-8 py-4 font-black text-black transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            Close Tracker
          </button>
        </div>
      </div>
    </div>
  );
};

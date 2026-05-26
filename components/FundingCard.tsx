
import React, { useState, useMemo } from 'react';
import { FundingOpportunityDb, FundingType, RoadmapStep } from '../types';
import { Heart, ChevronRight, ChevronDown, CheckCircle2, Share2, Copy, MessageCircle, X, ArrowUpRight, Info, Download, ShieldCheck, AlertTriangle, Clock, ListChecks } from 'lucide-react';

interface InstitutionLogoProps {
  opportunity: FundingOpportunityDb;
  isNew: boolean;
}

const InstitutionLogo: React.FC<InstitutionLogoProps> = ({ opportunity, isNew }) => {
  const [fallbackStage, setFallbackStage] = useState(0);
  
  const domain = useMemo(() => {
    try {
      if (opportunity.source_url) return new URL(opportunity.source_url).hostname;
      if (opportunity.application_url) return new URL(opportunity.application_url).hostname;
    } catch {
      return null;
    }
    return null;
  }, [opportunity.source_url, opportunity.application_url]);

  const logoUrl = useMemo(() => {
    if (fallbackStage === 0 && opportunity.logo_url) {
      return opportunity.logo_url;
    }
    if (fallbackStage <= 1 && domain) {
      return `https://logo.clearbit.com/${domain}`;
    }
    return null;
  }, [opportunity.logo_url, domain, fallbackStage]);

  return (
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold bg-white/5 transition-transform group-hover:scale-110 overflow-hidden shrink-0 ${isNew ? 'shadow-[0_0_15px_rgba(168,85,247,0.2)]' : ''}`}>
      {logoUrl ? (
        <img 
          src={logoUrl} 
          alt={`${opportunity.issuer_name} logo`}
          className="w-full h-full object-contain bg-white"
          onError={() => setFallbackStage(prev => prev + 1)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <>
          {opportunity.funding_type === FundingType.GRANT && <span className="text-emerald-400">$</span>}
          {opportunity.funding_type === FundingType.EQUITY && <span className="text-purple-400">#</span>}
          {opportunity.funding_type === FundingType.LOAN && <span className="text-blue-400">%</span>}
          {opportunity.funding_type === FundingType.COMPETITION && <span className="text-amber-400">★</span>}
          {(!opportunity.funding_type || ![FundingType.GRANT, FundingType.EQUITY, FundingType.LOAN, FundingType.COMPETITION].includes(opportunity.funding_type as FundingType)) && <span className="text-gray-400">?</span>}
        </>
      )}
    </div>
  );
};

interface FundingCardProps {
  opportunity: FundingOpportunityDb;
  onViewDetails: (id: string) => void;
  onStartApplication: (id: string) => void;
  onDownloadForm: (id: string) => void;
  matchScore?: number; // Optional match score
}

const FundingCard: React.FC<FundingCardProps> = ({ opportunity, onViewDetails, onStartApplication, onDownloadForm, matchScore }) => {
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const getRoadmap = (type: string | FundingType): RoadmapStep[] => {
    const baseSteps = [
      { id: '1', label: 'Profile Completion', isCompleted: true, description: 'Verify business details and owner info.' },
      { id: '2', label: 'Document Verification', isCompleted: false, description: 'Upload ID, CIPC, and Tax docs.' },
    ];

    switch (type) {
      case FundingType.GRANT:
        return [
          ...baseSteps,
          { id: '3', label: 'Impact Analysis', isCompleted: false, description: 'Describe the social or economic impact.' },
          { id: '4', label: 'Compliance Check', isCompleted: false, description: 'Verify alignment with grant mandates.' }
        ];
      case FundingType.LOAN:
        return [
          ...baseSteps,
          { id: '3', label: 'Credit Assessment', isCompleted: false, description: 'Analyze creditworthiness and repayment.' },
          { id: '4', label: 'Collateral Review', isCompleted: false, description: 'Verify business assets or guarantees.' }
        ];
      case FundingType.EQUITY:
        return [
          ...baseSteps,
          { id: '3', label: 'Pitch Deck Review', isCompleted: false, description: 'Expert evaluation of business model.' },
          { id: '4', label: 'Due Diligence', isCompleted: false, description: 'Deep dive into financials and legal.' }
        ];
      default:
        return [...baseSteps, { id: '3', label: 'Submission', isCompleted: false, description: 'Final review and send.' }];
    }
  };

  const getTypeColor = (type: string | FundingType) => {
    switch (type) {
      case FundingType.GRANT: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case FundingType.EQUITY: return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case FundingType.LOAN: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case FundingType.COMPETITION: return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getUrgencyIndicator = () => {
    if (opportunity.status === 'UPCOMING') {
      return { 
        color: 'text-cyan-400', 
        bg: 'bg-cyan-500/10', 
        border: 'border-cyan-500/20',
        label: `Expected: ${opportunity.expected_open_month || 'Soon'}` 
      };
    }
    
    if (opportunity.status === 'CLOSED') {
      return { 
        color: 'text-gray-500', 
        bg: 'bg-gray-500/10', 
        border: 'border-gray-500/20',
        label: 'Closed' 
      };
    }

    if (!opportunity.closing_date || opportunity.closing_date === 'Rolling' || opportunity.closing_date === 'Unknown') {
      return { 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-500/10', 
        border: 'border-emerald-500/20',
        label: '🟢 Rolling / Open' 
      };
    }

    const closeDate = new Date(opportunity.closing_date);
    const diffTime = closeDate.getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      return { 
        color: 'text-red-400', 
        bg: 'bg-red-500/10', 
        border: 'border-red-500/20',
        label: '🔴 Late Window (Submit NOW)' 
      };
    } else if (diffDays <= 21) {
      return { 
        color: 'text-amber-400', 
        bg: 'bg-amber-500/10', 
        border: 'border-amber-500/20',
        label: '🟡 Mid Window (Prepare Fast)' 
      };
    } else {
      return { 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-500/10', 
        border: 'border-emerald-500/20',
        label: '🟢 Early Window (Safe)' 
      };
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?oppId=${opportunity.opportunity_id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const text = `Check out this funding opportunity: ${opportunity.programme_name} by ${opportunity.issuer_name}. Range: R${opportunity.amount_min} - R${opportunity.amount_max}. Apply now on StacFund!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const steps = getRoadmap(opportunity.funding_type);
  const isNew = new Date(opportunity.last_verified_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  const urgency = getUrgencyIndicator();

  return (
    <div className={`glass-panel p-8 rounded-3xl relative overflow-hidden group transition-all ${isNew ? 'border-purple-500/40 hover:border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-white/5 hover:border-cyan-500/30'}`}>
      
      {/* Featured highlight */}
      {isNew && (
        <div className="absolute top-0 right-0 overflow-hidden w-28 h-28 pointer-events-none z-10 rounded-tr-3xl">
          <div className="absolute top-[24px] right-[-34px] bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest py-1 w-[150px] text-center rotate-45 shadow-lg border-y border-white/20">
            Featured
          </div>
        </div>
      )}

      {/* AI Match highlight */}
      {matchScore !== undefined && (
        <div className="absolute top-0 right-0 px-4 py-2 bg-cyan-500 text-white font-black text-[10px] uppercase tracking-widest rounded-bl-2xl z-10">
          {matchScore}% AI Match
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6 mb-6">
         <div className="flex-1">
            <div className="flex justify-between items-start mb-4">
              <div className="flex gap-4 items-center">
                <InstitutionLogo opportunity={opportunity} isNew={isNew} />
                <div>
                  <h4 className="text-xl font-black mb-1 group-hover:text-cyan-400 transition-colors flex items-center gap-2">
                    {opportunity.programme_name}
                  </h4>
                  <p className="text-gray-400 text-sm flex items-center gap-1">
                    {opportunity.issuer_name} 
                    {opportunity.official_status && <ShieldCheck size={14} className="text-emerald-500" title="Official Source Verified" />}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2 relative z-20">
                <button 
                  onClick={() => setShowShareModal(true)}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
                  title="Share Opportunity"
                >
                  <Share2 size={18} />
                </button>
                <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-500 transition-all border border-white/5">
                  <Heart size={18} />
                </button>
              </div>
            </div>

            <p className="text-gray-300 text-sm leading-relaxed mb-6 line-clamp-2 group-hover:line-clamp-none transition-all duration-500">
              {opportunity.eligibility_summary}
            </p>

            {opportunity.status === 'UPCOMING' && (
              <div className="mb-6 bg-cyan-500/5 border border-cyan-500/10 rounded-2xl p-4 flex gap-3">
                <Info className="text-cyan-400 shrink-0" size={20} />
                <div>
                  <h4 className="text-cyan-400 text-xs font-black uppercase tracking-widest mb-1">Preparation Phase</h4>
                  <p className="text-sm text-cyan-200/80">You are not applying yet. You are PREPARING. Build your vault before the window opens.</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <span className="text-xs font-bold text-gray-500 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                R{opportunity.amount_min.toLocaleString()} - R{opportunity.amount_max.toLocaleString()}
              </span>
              <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getTypeColor(opportunity.funding_type)} uppercase tracking-wider`}>
                {opportunity.funding_type}
              </span>
              <span className={`px-3 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider flex items-center gap-1 ${urgency.bg} ${urgency.color} ${urgency.border}`}>
                <Clock size={12} /> {urgency.label}
              </span>
            </div>
         </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 relative z-20">
        <button 
          onClick={() => onStartApplication(opportunity.opportunity_id)}
          disabled={opportunity.status === 'CLOSED'}
          className={`flex-1 font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.98] ${opportunity.status === 'CLOSED' ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : opportunity.status === 'UPCOMING' ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/20'}`}
        >
          {opportunity.status === 'UPCOMING' ? 'Prepare Application' : opportunity.status === 'CLOSED' ? 'Closed' : 'Start Application'} <ChevronRight size={18} />
        </button>
        <a 
          href={opportunity.pdf_form_url || (opportunity.application_url && opportunity.application_url !== 'N/A' && opportunity.application_url !== '' ? opportunity.application_url : opportunity.source_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black transition-all border border-white/10 flex items-center justify-center gap-2 cursor-pointer"
          title="Download/Open Official Form"
        >
          <Download size={18} /> <span className="hidden lg:inline">{opportunity.pdf_form_url ? 'PDF Form' : 'Form'}</span>
        </a>
        <a 
          href={opportunity.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-cyan-400 hover:text-cyan-300 font-black transition-all border border-cyan-500/30 flex items-center justify-center gap-2 cursor-pointer"
          title="Visit Official Source"
        >
          Source <ArrowUpRight size={18} />
        </a>
        <button 
          onClick={() => onViewDetails(opportunity.opportunity_id)}
          className="px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black transition-all border border-white/10 flex items-center justify-center gap-2"
        >
          Details <Info size={18} />
        </button>
        <button 
          onClick={() => setShowRoadmap(!showRoadmap)}
          className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/10 flex items-center justify-center"
          title="Toggle Preparation Roadmap"
        >
          {showRoadmap ? <ListChecks size={20} className="text-purple-400" /> : <ListChecks size={20} />}
        </button>
      </div>

      {showRoadmap && (
        <div className="mt-8 pt-8 border-t border-white/5 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
          {opportunity.preparation_checklist && opportunity.preparation_checklist.length > 0 && (
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-4 flex items-center gap-2">
                <CheckCircle2 size={14} /> Preparation Checklist
              </h4>
              <ul className="space-y-3">
                {opportunity.preparation_checklist.map((item, idx) => (
                  <li key={idx} className="flex gap-3 text-sm text-gray-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opportunity.common_rejection_reasons && opportunity.common_rejection_reasons.length > 0 && (
            <div className="p-6 bg-red-500/5 rounded-2xl border border-red-500/10">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-red-400 mb-4 flex items-center gap-2">
                <AlertTriangle size={14} /> Why People Fail
              </h4>
              <ul className="space-y-3">
                {opportunity.common_rejection_reasons.map((item, idx) => (
                  <li key={idx} className="flex gap-3 text-sm text-red-200/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div>
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-4 flex items-center gap-2">
              <Info size={14} className="text-purple-400" /> Standard Process
            </h4>
            <div className="relative space-y-8 ml-3">
               <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-white/5"></div>
               {steps.map((step) => (
                 <div key={step.id} className="relative flex gap-4 items-start">
                   <div className={`mt-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10 ${step.isCompleted ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-[#1a1a2e] border-2 border-white/10'}`}>
                     {step.isCompleted ? <CheckCircle2 size={10} className="text-white" /> : <div className="w-1 h-1 bg-white/20 rounded-full"></div>}
                   </div>
                   <div>
                     <h5 className={`font-bold text-sm ${step.isCompleted ? 'text-white' : 'text-gray-400'}`}>{step.label}</h5>
                     <p className="text-[10px] text-gray-600 mt-0.5 font-medium">{step.description}</p>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal Backdrop */}
      {showShareModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowShareModal(false)}></div>
          <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowShareModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-4">
                <Share2 size={32} />
              </div>
              <h3 className="text-xl font-black mb-1">Share Opportunity</h3>
              <p className="text-gray-500 text-sm">Help others discover this grant</p>
            </div>
            <div className="space-y-3">
              <button 
                onClick={handleWhatsAppShare}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/20 text-[#25D366] font-black transition-all"
              >
                <div className="p-2 rounded-lg bg-[#25D366] text-white">
                  <MessageCircle size={20} />
                </div>
                Share to WhatsApp
              </button>
              <button 
                onClick={handleCopyLink}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black transition-all"
              >
                <div className="p-2 rounded-lg bg-gray-800 text-gray-400">
                  <Copy size={20} />
                </div>
                {copied ? 'Copied to Clipboard!' : 'Copy Opportunity Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FundingCard;

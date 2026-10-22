import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, CheckCircle2, AlertCircle, FileText, Users, DollarSign, 
  MapPin, ShieldCheck, ChevronRight, ExternalLink, X, Briefcase, 
  Sparkles, Award, ArrowRight, HelpCircle, Layers, CheckSquare, Square
} from 'lucide-react';
import { FundingOpportunityDb, FundingType } from '../types';

interface PremierFundingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilterPremierFunds?: () => void;
  onSelectOpportunity?: (oppId: string) => void;
}

interface ProvinceProgram {
  province: string;
  fundName: string;
  adminBody: string;
  fundingType: string;
  amountRange: string;
  jobRequirement: string;
  submissionType: string;
  officialPortal: string;
  description: string;
  keySectors: string[];
  oppId?: string;
}

const PROVINCE_PROGRAMS: ProvinceProgram[] = [
  {
    province: 'KwaZulu-Natal',
    fundName: 'KZN Youth Empowerment Fund (KZNYEF)',
    adminBody: 'KwaZulu-Natal Office of the Premier',
    fundingType: '100% Non-Repayable Grant',
    amountRange: 'R1,000 to R2,000,000',
    jobRequirement: 'Tier 1: 2 jobs | Tier 2: 4 jobs | Tier 3: 10 jobs',
    submissionType: 'Physical Submission at District Municipalities',
    officialPortal: 'https://www.kznonline.gov.za',
    description: 'Tiered grant support for 100% youth-owned businesses (18–35). Disbursed directly to equipment and asset suppliers to foster durable industrial job creation.',
    keySectors: ['Agriculture', 'Manufacturing', 'ICT & Tech', 'Green Economy', 'Tourism', 'Creative'],
    oppId: 'kznotp_yef_001',
  },
  {
    province: 'Eastern Cape',
    fundName: 'Isiqalo Youth Development Fund',
    adminBody: 'Eastern Cape Office of the Premier (EC OTP)',
    fundingType: 'Seed Grant & Equipment Finance',
    amountRange: 'R10,000 to R500,000',
    jobRequirement: 'Min 2 sustainable full-time youth jobs',
    submissionType: 'Provincial Youth Directorate & District Offices',
    officialPortal: 'https://www.ecprov.gov.za',
    description: 'Bridges early-stage commercial risk by funding critical machinery, operational tooling, and working capital for registered EC youth ventures.',
    keySectors: ['Agro-Processing', 'Automotive Supply', 'Maritime / Ocean Economy', 'Township Retail'],
    oppId: 'ecotp_isiqalo_002',
  },
  {
    province: 'Mpumalanga',
    fundName: "Premier's Youth Development Fund (PYDF)",
    adminBody: 'Mpumalanga Office of the Premier & MEGA',
    fundingType: 'Direct Capital Grant',
    amountRange: 'R50,000 to R1,000,000',
    jobRequirement: 'Priority given to scalable rural job creation',
    submissionType: 'District MEGA / OTP submission points',
    officialPortal: 'https://www.mpumalanga.gov.za',
    description: 'Capital asset and industrialization grant for young entrepreneurs across Ehlanzeni, Gert Sibande, and Nkangala municipal districts.',
    keySectors: ['Agriculture', 'Mining Support Services', 'Tourism & Hospitality', 'Manufacturing'],
    oppId: 'mp_pydf_003',
  },
  {
    province: 'Gauteng',
    fundName: 'Moswa Kgwebong Youth Enterprise Fund',
    adminBody: 'Gauteng Provincial Government (GPG), GEP & NYDA',
    fundingType: '50% Grant + 50% Concessionary Soft Loan',
    amountRange: 'R100,000 to R1,000,000',
    jobRequirement: 'Minimum 3 to 6 permanent jobs created',
    submissionType: 'Online via Gauteng SMME Portal & GEP Regional Branches',
    officialPortal: 'https://smmeonline.gauteng.gov.za',
    description: 'R60 Million blended funding vehicle. NYDA contributes the 50% grant portion while the Gauteng Enterprise Propeller manages the low-interest loan portion.',
    keySectors: ['Township Economy', 'Logistics', 'Digital Tech', 'Light Manufacturing', 'Agro-processing'],
    oppId: 'gpg_moswa_004',
  },
  {
    province: 'Other Provinces',
    fundName: "Premier's Discretionary & Bursary Schemes",
    adminBody: 'Limpopo, Free State & North West OTPs',
    fundingType: 'Discretionary Grants & Scarce Skills Bursaries',
    amountRange: 'Varies by provincial fiscal cycle',
    jobRequirement: 'Skills transfer & youth empowerment focus',
    submissionType: 'Provincial Portals and Community Centres',
    officialPortal: 'https://www.gov.za',
    description: 'Special discretionary interventions, youth incubators (e.g. Victor Thebe Sifora in North West), and technical vocational bursaries for emerging talent.',
    keySectors: ['Technical Trades', 'Artisans', 'Agri-tech', 'Education'],
  },
];

const AUDIT_CHECKLIST_ITEMS = [
  { id: 'age', label: '100% South African Youth-Owned (18–35 years)', tip: 'All shareholders/directors must be SA citizens aged 18 to 35 with valid green ID or smart ID card.' },
  { id: 'residence', label: 'Provincial Proof of Address (< 3 months)', tip: 'Municipal utility bill, lease agreement, or official letter from a recognised Traditional Authority or Ward Councillor.' },
  { id: 'cipc', label: 'Active CIPC Business Registration', tip: 'Registered Pty Ltd, Close Corporation, or fully registered Co-operative in good standing.' },
  { id: 'sars', label: 'SARS Tax Compliance Status PIN', tip: 'Your business must have an active Tax PIN verifying good standing (no outstanding returns or unmanaged debt).' },
  { id: 'quotes', label: '3x Comparative Supplier Quotations', tip: 'For every asset/machine requested, provide 3 independent quotations with supplier VAT numbers and banking details.' },
  { id: 'plan', label: 'Viable Business Plan & 12-Month Projections', tip: 'A clear operational model demonstrating demand, cost breakdown, and how the assets will generate revenue.' },
  { id: 'jobs', label: 'Feasible Job Creation Commitment', tip: 'Ability to employ local youths (minimum 2 to 10 jobs depending on your funding threshold).' }
];

export const PremierFundingGuideModal: React.FC<PremierFundingGuideModalProps> = ({
  isOpen,
  onClose,
  onFilterPremierFunds,
  onSelectOpportunity
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'provinces' | 'auditor' | 'rules'>('overview');
  const [selectedProvinceIdx, setSelectedProvinceIdx] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    age: true,
    residence: true,
    cipc: false,
    sars: false,
    quotes: false,
    plan: false,
    jobs: false
  });

  if (!isOpen) return null;

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checkedItems).filter(Boolean).length;
  const readinessPercent = Math.round((completedCount / AUDIT_CHECKLIST_ITEMS.length) * 100);

  const selectedProgram = PROVINCE_PROGRAMS[selectedProvinceIdx];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#0B0F19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-white"
        >
          {/* Header Banner */}
          <div className="relative p-6 sm:p-8 bg-gradient-to-r from-cyan-950/60 via-indigo-950/40 to-slate-900 border-b border-white/10 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                  <Building2 size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest">
                    <span>Provincial Government Intelligence</span>
                    <span>·</span>
                    <span>South Africa</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                    Office of the Premier (OTP) Funding Suite
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center gap-1.5 mt-6 p-1 bg-black/40 rounded-xl border border-white/5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'overview' ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                1. What is OTP Funding?
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('provinces')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'provinces' ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                2. Provincial Funds ({PROVINCE_PROGRAMS.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('auditor')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeTab === 'auditor' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>3. Readiness Auditor</span>
                <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px] tabular-nums font-mono">
                  {readinessPercent}%
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rules')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'rules' ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                4. Critical Submission Rules
              </button>
            </div>
          </div>

          {/* Modal Content Area */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
            
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-cyan-400" size={18} />
                    Understanding Office of the Premier Funding in South Africa
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    In South Africa, each of the nine provincial governments is led by the Premier. The <strong className="text-white">Office of the Premier (OTP)</strong> operates as the premier executive administrative authority in the province, holding dedicated capital reserves and special purpose funds to stimulate economic growth, reduce youth unemployment, and develop township and rural enterprises.
                  </p>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Unlike commercial banks that provide debt, or standard procurement tenders, Premier Funds are largely <strong className="text-emerald-400">non-repayable grants</strong> or <strong className="text-cyan-400">blended concessional facilities</strong> designed specifically to finance equipment, machinery, and tools for high-potential youth enterprises.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">
                      <DollarSign size={16} />
                    </div>
                    <h4 className="font-bold text-white text-sm">Non-Repayable Capital</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Most OTP allocations are pure grants or 50/50 blended packages that do not require high interest payments or personal balance sheet collateral.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-sm">
                      <Briefcase size={16} />
                    </div>
                    <h4 className="font-bold text-white text-sm">Direct Supplier Disbursement</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      To prevent misuse, OTP funds disburse directly to verified machinery and tool suppliers against verified tax invoices, rather than cash deposits.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm">
                      <Users size={16} />
                    </div>
                    <h4 className="font-bold text-white text-sm">Mandatory Job Creation</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Applicants are legally bound by grant agreements to employ youth from the local municipality (e.g. 2 to 10 jobs created per tier).
                    </p>
                  </div>
                </div>

                {/* 3-Tier Youth Empowerment Scheme Diagram */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider text-gray-400">
                    Standard OTP Funding Threshold Matrix (E.g. KZN Model)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Threshold 1</span>
                      <div className="text-lg font-black text-white font-mono tabular-nums">R1k – R100,000</div>
                      <p className="text-xs text-gray-400">Informal & Micro Startups</p>
                      <div className="text-[11px] font-semibold text-emerald-400 pt-1 border-t border-white/5">
                        Minimum 2 Permanent Jobs
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Threshold 2</span>
                      <div className="text-lg font-black text-white font-mono tabular-nums">R100k – R500,000</div>
                      <p className="text-xs text-gray-400">Emerging Small Businesses</p>
                      <div className="text-[11px] font-semibold text-emerald-400 pt-1 border-t border-white/5">
                        Minimum 4 Permanent Jobs
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Threshold 3</span>
                      <div className="text-lg font-black text-white font-mono tabular-nums">R500k – R2,000,000</div>
                      <p className="text-xs text-gray-400">Growth & Industrial Scale-up</p>
                      <div className="text-[11px] font-semibold text-emerald-400 pt-1 border-t border-white/5">
                        Minimum 10 Permanent Jobs
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PROVINCIAL FUNDS */}
            {activeTab === 'provinces' && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {PROVINCE_PROGRAMS.map((prog, idx) => (
                    <button
                      key={prog.province}
                      type="button"
                      onClick={() => setSelectedProvinceIdx(idx)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedProvinceIdx === idx
                          ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                          : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {prog.province}
                    </button>
                  ))}
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                    <div>
                      <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">
                        {selectedProgram.province} Office of the Premier
                      </span>
                      <h3 className="text-xl font-black text-white mt-0.5">
                        {selectedProgram.fundName}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">{selectedProgram.adminBody}</p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-xs text-gray-400 block">Grant Range</span>
                      <span className="text-lg font-black text-emerald-400 font-mono tabular-nums">
                        {selectedProgram.amountRange}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 leading-relaxed">
                    {selectedProgram.description}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                      <span className="text-gray-400 font-semibold block">Funding Instrument</span>
                      <span className="text-white font-bold">{selectedProgram.fundingType}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-1">
                      <span className="text-gray-400 font-semibold block">Employment Covenant</span>
                      <span className="text-emerald-400 font-bold">{selectedProgram.jobRequirement}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-1 sm:col-span-2">
                      <span className="text-gray-400 font-semibold block">Submission Channel</span>
                      <span className="text-amber-300 font-bold">{selectedProgram.submissionType}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-gray-400 block mb-2">Priority Focus Sectors:</span>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                      {selectedProgram.keySectors.map((sector, i) => (
                        <span key={sector} className="bg-white/5 px-2.5 py-1 rounded-md border border-white/5">
                          {sector}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/5">
                    {selectedProgram.oppId && onSelectOpportunity && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectOpportunity(selectedProgram.oppId!);
                          onClose();
                        }}
                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                      >
                        <span>View Opportunity Details</span>
                        <ArrowRight size={14} />
                      </button>
                    )}

                    <a
                      href={selectedProgram.officialPortal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 border border-white/5"
                    >
                      <span>Official Provincial Portal</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: READINESS AUDITOR */}
            {activeTab === 'auditor' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                      Audit Your OTP Readiness
                    </span>
                    <h3 className="text-lg font-black text-white">
                      The 7 Non-Negotiable Provincial Criteria
                    </h3>
                    <p className="text-xs text-gray-400">
                      Check each requirement to calculate your real probability of approval before submitting.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-xs text-gray-400 block">Score</span>
                      <span className="text-2xl font-black text-emerald-400 font-mono tabular-nums">
                        {readinessPercent}%
                      </span>
                    </div>
                    <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 flex items-center justify-center bg-emerald-500/10">
                      <ShieldCheck className="text-emerald-400" size={24} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {AUDIT_CHECKLIST_ITEMS.map((item) => {
                    const isChecked = !!checkedItems[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                          isChecked 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-white' 
                            : 'bg-white/[0.02] border-white/5 text-gray-400 hover:border-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          className="mt-0.5 text-emerald-400 shrink-0"
                          aria-label={`Toggle ${item.label}`}
                        >
                          {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold ${isChecked ? 'text-white' : 'text-gray-300'}`}>
                            {item.label}
                          </h4>
                          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                            {item.tip}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Audit Verdict Banner */}
                <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
                  readinessPercent >= 80 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                    : readinessPercent >= 50
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}>
                  <strong className="block font-bold mb-1">
                    {readinessPercent >= 80 
                      ? '✓ Prime Candidate: Ready for Provincial Window' 
                      : readinessPercent >= 50
                      ? '⚠ Action Needed: Prepare Missing Quotations & Tax Status'
                      : '✕ High Rejection Risk: Foundational Formalization Missing'}
                  </strong>
                  {readinessPercent >= 80 
                    ? 'Your compliance documents and job creation scope match standard OTP thresholds. You can proceed directly to prepare your comparative supplier quotations and physical submission bundle.' 
                    : 'The Office of the Premier strictly disqualifies applications with expired tax compliance, incomplete comparative supplier quotations, or uncertified ID copies. Ensure all 7 points are in order prior to deadline.'}
                </div>
              </div>
            )}

            {/* TAB 4: RULES */}
            {activeTab === 'rules' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-2">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <AlertCircle className="text-amber-400" size={16} />
                    Common Fatal Rejection Traps in OTP Applications
                  </h4>
                  <p>
                    Over 65% of provincial youth fund submissions are eliminated in Phase 1 administrative screening before a committee ever reads the business concept. Avoid these top failure modes:
                  </p>
                </div>

                <div className="space-y-3 text-xs text-gray-300">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <strong className="text-white block font-bold">1. Emailed Submissions When In-Person is Required</strong>
                    <p className="text-gray-400">
                      Funds like the KZN Youth Empowerment Fund explicitly state that applications sent via email will NOT be considered. They must be printed in duplicate and hand-delivered to your designated District Municipality or Local Economic Development (LED) office.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <strong className="text-white block font-bold">2. Related-Party or Non-Compliant Quotations</strong>
                    <p className="text-gray-400">
                      Supplier quotations must come from three independent, registered businesses with active CIPC and SARS status. Providing quotations from family members, unregistered brokers, or without clear physical addresses triggers immediate disqualification for conflict of interest.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <strong className="text-white block font-bold">3. Outdated Certified ID Copies</strong>
                    <p className="text-gray-400">
                      All certified copies of South African ID cards or passports must have been stamped by the South African Police Service (SAPS) or a Commissioner of Oaths within the last 3 months.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <strong className="text-white block font-bold">4. Requesting Cash for Working Capital Alone</strong>
                    <p className="text-gray-400">
                      Provincial OTP programs favor capital equipment, operational plant, agro-processing machinery, or tech infrastructure. Proposing 100% operational salaries without tangible assets severely reduces funding likelihood.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Modal Footer */}
          <div className="p-4 sm:p-6 bg-black/60 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-cyan-400" />
              <span>Official Provincial Data · Updated for 2026</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {onFilterPremierFunds && (
                <button
                  type="button"
                  onClick={() => {
                    onFilterPremierFunds();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs transition-colors flex items-center gap-2"
                >
                  <Building2 size={14} />
                  <span>Filter Premier Funds in Explorer</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium text-xs transition-colors border border-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PremierFundingGuideModal;

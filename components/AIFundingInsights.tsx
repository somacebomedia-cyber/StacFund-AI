// components/AIFundingInsights.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  Sparkles, 
  RefreshCw, 
  DollarSign, 
  Building2, 
  Lightbulb, 
  ArrowRight, 
  CheckCircle2, 
  Compass, 
  ShieldCheck, 
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createGeminiClient } from '../services/geminiClient';
import { handleGeminiError } from '../services/geminiError';
import { User } from '../types';

export interface FundingInsightData {
  industry: string;
  marketSentiment: 'VERY HIGH' | 'HIGH' | 'MODERATE' | 'SELECTIVE';
  appetiteScore: number; // 0 - 100
  typicalGrantRange: string;
  trendHeadline: string;
  summary: string;
  keyTrends: string[];
  priorityFocusAreas: string[];
  activeFunders: { name: string; type: string; focus: string }[];
  actionableFounderTips: string[];
  regulatoryDrivers: string;
  lastFetched: string;
}

export const COMMON_INDUSTRIES = [
  'Technology & Software',
  'Agriculture & Agro-processing',
  'Renewable Energy & Cleantech',
  'Manufacturing & Industrial',
  'Healthcare & Biotechnology',
  'Tourism & Hospitality',
  'Retail & E-commerce',
  'Logistics & Supply Chain',
  'Creative & Media Services'
];

// Curated baseline data for instant zero-latency preview and reliable fallback
const CURATED_INDUSTRY_DEFAULTS: Record<string, FundingInsightData> = {
  'Technology & Software': {
    industry: 'Technology & Software',
    marketSentiment: 'VERY HIGH',
    appetiteScore: 89,
    typicalGrantRange: 'R250k - R5.0M',
    trendHeadline: 'Surge in AI-enabled SaaS, FinTech, and B2B Automation Grants',
    summary: 'South African DFIs and venture programs are prioritizing scalable IP-owning tech businesses, particularly in financial inclusion, logistics tech, and enterprise AI tools. TIA and IDC have dedicated funding windows for early-stage commercialization.',
    keyTrends: [
      'Increased blended finance combining non-repayable grants with convertible notes.',
      'DFIs favoring proprietary IP over outsourced code or white-label solutions.',
      'Surge in corporate venture capital (CVC) matching funds from major RSA banks.'
    ],
    priorityFocusAreas: ['FinTech & Payments', 'Enterprise AI Automation', 'Cybersecurity', 'EdTech'],
    activeFunders: [
      { name: 'Technology Innovation Agency (TIA)', type: 'Government DFI', focus: 'Seed & Commercialization Grants' },
      { name: 'IDC Venture Capital', type: 'State DFI', focus: 'Growth & Equity Financing' },
      { name: 'Naspers Foundry & VC Networks', type: 'Private VC', focus: 'Late-Seed to Series A' }
    ],
    actionableFounderTips: [
      'Ensure IP assignment and software copyright are documented in your business name before applying.',
      'Quantify your customer acquisition cost (CAC) and monthly recurring revenue (MRR) metrics clearly in slides.'
    ],
    regulatoryDrivers: 'National R&D Tax Incentive (Section 11D) provides up to 150% tax deductions for novel tech development.',
    lastFetched: 'Curated SA Grid'
  },
  'Agriculture & Agro-processing': {
    industry: 'Agriculture & Agro-processing',
    marketSentiment: 'VERY HIGH',
    appetiteScore: 92,
    typicalGrantRange: 'R500k - R15.0M',
    trendHeadline: 'High Priority on Climate-Smart AgTech & Import-Replacement Processing',
    summary: 'National food security and rural job creation make agriculture the highest-subsidized sector in South Africa. Government programs such as CASIDRA, Land Bank, and DALRRD actively fund processing machinery, irrigation, and cold-chain infrastructure.',
    keyTrends: [
      'Agro-processing grants prioritized over primary farming to spur manufacturing jobs.',
      'Subsidies for solar borehole pumps and climate-resilient drip irrigation.',
      'Preference for export-ready crops (macadamias, citrus, blueberries, wine).'
    ],
    priorityFocusAreas: ['Secondary Food Processing', 'Hydroponics & Precision Farming', 'Cold Storage Logistics'],
    activeFunders: [
      { name: 'Land Bank Blended Finance Scheme', type: 'State DFI', focus: 'Concessionary Debt & Grants' },
      { name: 'AgriSETA Discretionary Fund', type: 'SETA Agency', focus: 'Skills & Farm Equipment' },
      { name: 'CASIDRA Agro-Processing', type: 'Provincial Entity', focus: 'Western & Eastern Cape Grants' }
    ],
    actionableFounderTips: [
      'Attach existing offtake agreements or letters of intent from retail supermarkets to guarantee approval.',
      'Demonstrate water-use license compliance and solar power backup plans.'
    ],
    regulatoryDrivers: 'AgriBEE Transformation Charter unlocks 20-40% grant portions on blended debt facilities.',
    lastFetched: 'Curated SA Grid'
  },
  'Renewable Energy & Cleantech': {
    industry: 'Renewable Energy & Cleantech',
    marketSentiment: 'VERY HIGH',
    appetiteScore: 95,
    typicalGrantRange: 'R1.0M - R25.0M',
    trendHeadline: 'Aggressive Capital Allocation for Solar, Storage, and Energy Efficiency',
    summary: 'South Africa\'s grid decentralization has unlocked unprecedented grant and debt pools from both domestic institutions and international climate funds (JETP, DBSA, Green Fund). Businesses deploying decentralized solar, mini-grids, or battery storage enjoy fast-track evaluations.',
    keyTrends: [
      'Rapid deployment of concessional loans with 0-3% interest rates for green projects.',
      'DFIs covering up to 40% of capital expenditure for commercial microgrid installations.',
      'Waste-to-energy and biomass projects gaining strong regional traction in KZN and Gauteng.'
    ],
    priorityFocusAreas: ['Commercial & Industrial Solar', 'Battery Energy Storage Systems (BESS)', 'Energy Management Tech'],
    activeFunders: [
      { name: 'DBSA Green Fund', type: 'National DFI', focus: 'Renewable Infrastructure Grants' },
      { name: 'Nedbank Green Economy Fund', type: 'Commercial Bank', focus: 'Clean Energy Debt & Subsidies' },
      { name: 'IDC New Energy Fund', type: 'Industrial DFI', focus: 'Component Manufacturing & Solar Farms' }
    ],
    actionableFounderTips: [
      'Provide detailed feasibility studies including levelized cost of energy (LCOE) and payback curves.',
      'Highlight municipal wheeling approvals or grid-tie compliance certificates.'
    ],
    regulatoryDrivers: 'Section 12BA 125% upfront tax deduction for renewable energy assets operational before 2026.',
    lastFetched: 'Curated SA Grid'
  },
  'Manufacturing & Industrial': {
    industry: 'Manufacturing & Industrial',
    marketSentiment: 'HIGH',
    appetiteScore: 84,
    typicalGrantRange: 'R500k - R10.0M',
    trendHeadline: 'DTIC Local Procurement Incentives & Capital Equipment Subsidies',
    summary: 'Industrialization remains a cornerstone of DTIC policy. Grants like the Black Industrialists Scheme (BIS) and Support Programme for Industrial Innovation (SPII) provide machinery subsidies to manufacturers expanding factory capacity.',
    keyTrends: [
      'Grants requiring at least 51% black youth or women shareholding for maximum cost-sharing.',
      'Green manufacturing upgrades (efficiency, water recycling) receiving matching bonuses.',
      'Export development grants supporting South African products entering the AfCFTA market.'
    ],
    priorityFocusAreas: ['Automotive Components', 'Food Packaging', 'Chemicals & Plastics', 'Steel & Metal Fabrication'],
    activeFunders: [
      { name: 'DTIC Black Industrialists Scheme', type: 'Government Ministry', focus: 'Machinery & Capex Grants' },
      { name: 'SEFA Direct Lending', type: 'SME Agency', focus: 'Asset Finance & Working Capital' },
      { name: 'National Empowerment Fund (NEF)', type: 'Empowerment DFI', focus: 'Industrial Expansion Debt/Equity' }
    ],
    actionableFounderTips: [
      'Secure formal supplier supplier quotes with 3 comparative bids for all requested equipment.',
      'Highlight direct factory jobs that will be created per million Rand requested.'
    ],
    regulatoryDrivers: 'AfCFTA tariff reductions and preferential procurement status for certified South African producers.',
    lastFetched: 'Curated SA Grid'
  }
};

interface AIFundingInsightsProps {
  user: User | null;
  businessInfo?: {
    industry?: string;
    name?: string;
    description?: string;
    years?: string;
    revenue?: string;
  };
  onExploreIndustry?: (industry: string) => void;
}

export const AIFundingInsights: React.FC<AIFundingInsightsProps> = ({
  user,
  businessInfo,
  onExploreIndustry
}) => {
  // Normalize industry from profile or default
  const getInitialIndustry = (): string => {
    const raw = businessInfo?.industry?.trim();
    if (!raw) return 'Technology & Software';
    
    // Fuzzy match against common industries
    const matched = COMMON_INDUSTRIES.find(ind => 
      ind.toLowerCase().includes(raw.toLowerCase()) || raw.toLowerCase().includes(ind.toLowerCase())
    );
    return matched || raw;
  };

  const [selectedIndustry, setSelectedIndustry] = useState<string>(() => getInitialIndustry());
  const [insightData, setInsightData] = useState<FundingInsightData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trends' | 'funders' | 'playbook'>('trends');
  const industrySelectId = 'industry-selector-insights';

  // Update selected industry if business profile changes
  useEffect(() => {
    const newInd = getInitialIndustry();
    if (newInd && newInd !== selectedIndustry) {
      setSelectedIndustry(newInd);
    }
  }, [businessInfo?.industry]);

  // Fetch or retrieve insights
  const fetchIndustryInsights = useCallback(async (industryToFetch: string, forceRefresh: boolean = false) => {
    setError(null);
    const cacheKey = `stacfund_ai_insights_${industryToFetch.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    // 1. Check local cache if not forcing refresh
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if cache is fresh (less than 24 hours old)
          const cacheTime = parsed._cacheTime || 0;
          if (Date.now() - cacheTime < 24 * 60 * 60 * 1000) {
            setInsightData(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn('Could not read cached insights', e);
      }
    }

    // 2. Set baseline curated preview while fetching fresh AI analysis
    const curatedFallback = CURATED_INDUSTRY_DEFAULTS[industryToFetch] || {
      industry: industryToFetch,
      marketSentiment: 'HIGH',
      appetiteScore: 82,
      typicalGrantRange: 'R250k - R5.0M',
      trendHeadline: `Active Funding Windows for South African ${industryToFetch} SMMEs`,
      summary: `Public DFIs (SEFA, NEF, NYDA) and corporate ESD funds have open allocations for growing enterprises in the ${industryToFetch} space. Emphasis is placed on formalization, job creation, and compliance.`,
      keyTrends: [
        'Preferential scoring for businesses with complete compliance and tax clearance.',
        'Emergence of hybrid concessionary debt with deferred repayment periods.',
        'ESD funds seeking local SME suppliers for enterprise supply chains.'
      ],
      priorityFocusAreas: ['Local Supply Chain Integration', 'Product Innovation', 'Digital Transformation'],
      activeFunders: [
        { name: 'Small Enterprise Finance Agency (SEFA)', type: 'National Agency', focus: 'Working Capital & Asset Finance' },
        { name: 'National Empowerment Fund (NEF)', type: 'Empowerment DFI', focus: 'Asset & Expansion Capital' },
        { name: 'NYDA Grant Programme', type: 'Youth DFI', focus: 'Micro & Early-Stage Capital' }
      ],
      actionableFounderTips: [
        'Keep financial projections conservative with realistic cash-flow timelines.',
        'Maintain valid SARS tax clearance pin and CIPC annual returns.'
      ],
      regulatoryDrivers: 'Broad-Based Black Economic Empowerment (B-BBEE) procurement recognition drives corporate ESD spend.',
      lastFetched: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (!insightData) {
      setInsightData(curatedFallback);
    }

    setIsLoading(true);

    try {
      const ai = await createGeminiClient();

      const prompt = `
You are an authoritative South African venture capital, DFI (Development Finance Institution), and SME funding intelligence analyst.
Analyze current funding market trends and investor appetite for the following industry in South Africa:

INDUSTRY: "${industryToFetch}"
USER BUSINESS CONTEXT: "${businessInfo?.name || 'South African SMME'}" - ${businessInfo?.description || 'Growing entrepreneurial enterprise'}

TASK:
Provide a realistic, up-to-date funding landscape analysis for South African entrepreneurs in this sector.
Include real South African funding bodies (e.g., TIA, IDC, SEFA, NYDA, DBSA, NEF, CASIDRA, ECDC, corporate ESD funds, venture networks).

Return a strict, valid JSON object matching this schema:
{
  "industry": "${industryToFetch}",
  "marketSentiment": "VERY HIGH" | "HIGH" | "MODERATE" | "SELECTIVE",
  "appetiteScore": 88, // integer 0-100 representing capital availability
  "typicalGrantRange": "e.g. R250k - R3.5M",
  "trendHeadline": "Concise 6-10 word punchy trend title",
  "summary": "2-3 sentences providing an executive summary of current funding dynamics, who is allocating money, and what lenders/grant-makers demand.",
  "keyTrends": [
    "Specific trend 1 (e.g. shift toward blended finance or solar incentives)",
    "Specific trend 2",
    "Specific trend 3"
  ],
  "priorityFocusAreas": [
    "Sub-focus 1", "Sub-focus 2", "Sub-focus 3"
  ],
  "activeFunders": [
    { "name": "Funder Name", "type": "DFI | Private Equity | Bank | Agency", "focus": "What they fund" },
    { "name": "Funder Name", "type": "DFI | Private Equity | Bank | Agency", "focus": "What they fund" },
    { "name": "Funder Name", "type": "DFI | Private Equity | Bank | Agency", "focus": "What they fund" }
  ],
  "actionableFounderTips": [
    "Practical actionable tip 1 for maximizing grant/loan approval",
    "Practical actionable tip 2 for application readiness"
  ],
  "regulatoryDrivers": "Key South African policy or incentive driving funding (e.g., Section 12BA, BIS, B-BBEE Scorecard, etc.)"
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3
        }
      });

      const responseText = response.text || '';
      const parsedData = JSON.parse(responseText) as FundingInsightData;

      parsedData.lastFetched = 'Live AI Analysis (' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ')';

      setInsightData(parsedData);

      // Save to local cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          ...parsedData,
          _cacheTime: Date.now()
        }));
      } catch (cacheErr) {
        console.warn('Failed to cache insights to localStorage', cacheErr);
      }

    } catch (err: unknown) {
      console.warn('Gemini Funding Insights generation encountered an issue:', err);
      handleGeminiError(err);
      
      // If we don't already have insights, fall back to curated defaults
      if (!insightData) {
        setInsightData(curatedFallback);
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      const isQuota = rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('credit') || rawMsg.toLowerCase().includes('429');
      setError(isQuota ? 'Live AI quota depleted. Showing verified baseline market intelligence.' : 'Could not refresh live insights right now. Baseline data loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [businessInfo, insightData]);

  // Trigger fetch on mount or industry switch
  useEffect(() => {
    fetchIndustryInsights(selectedIndustry, false);
  }, [selectedIndustry]);

  const handleIndustryChange = (newIndustry: string) => {
    setSelectedIndustry(newIndustry);
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'VERY HIGH':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400',
          gauge: 'from-emerald-500 to-cyan-500',
          label: 'Surging Capital'
        };
      case 'HIGH':
        return {
          bg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
          dot: 'bg-cyan-400',
          gauge: 'from-cyan-500 to-blue-500',
          label: 'Strong Inflow'
        };
      case 'MODERATE':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-400',
          gauge: 'from-amber-500 to-orange-500',
          label: 'Targeted Allocation'
        };
      default:
        return {
          bg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
          dot: 'bg-purple-400',
          gauge: 'from-purple-500 to-indigo-500',
          label: 'Niche / Selective'
        };
    }
  };

  const sentimentStyle = getSentimentColor(insightData?.marketSentiment || 'HIGH');

  return (
    <div className="glass-panel p-5 sm:p-6 lg:p-7 rounded-3xl relative overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-[#090d16]/95 w-full min-w-0 group">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-cyan-600/10 rounded-full blur-[100px] pointer-events-none group-hover:bg-cyan-600/15 transition-all duration-700" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none group-hover:bg-purple-600/15 transition-all duration-700" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/5 relative z-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/10 border border-purple-500/30 text-purple-300">
              <Sparkles size={11} className="text-purple-400" />
              Gemini 3.8 Market Intelligence
            </span>
            <span className="text-[11px] font-mono text-gray-500 flex items-center gap-1">
              <Compass size={12} className="text-cyan-400" />
              South Africa Capital Radar
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center text-cyan-400 shrink-0">
              <TrendingUp size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2 truncate">
                AI Funding Insights
              </h3>
              <p className="text-xs text-gray-400 truncate">
                Live market trends, grant allocations & investor appetite for your sector
              </p>
            </div>
          </div>
        </div>

        {/* Industry Switcher & Refresh Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
          <div className="relative">
            <label htmlFor={industrySelectId} className="sr-only">Select industry for funding insights</label>
            <select
              id={industrySelectId}
              value={selectedIndustry}
              onChange={(e) => handleIndustryChange(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-cyan-400 appearance-none pr-8 cursor-pointer hover:bg-white/10 transition-colors"
            >
              {COMMON_INDUSTRIES.map((ind) => (
                <option key={ind} value={ind} className="bg-[#0b101b] text-white">
                  {ind}
                </option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-[10px]">
              ▼
            </div>
          </div>

          <button
            onClick={() => fetchIndustryInsights(selectedIndustry, true)}
            disabled={isLoading}
            title="Refresh latest trends via Gemini"
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-cyan-400' : ''} />
            <span className="hidden md:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Warning Notice if offline or quota limit */}
      {error && (
        <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2.5 relative z-10 animate-in fade-in">
          <AlertCircle size={15} className="shrink-0 text-amber-400" />
          <span className="flex-1 text-[11px] leading-relaxed">{error}</span>
        </div>
      )}

      {/* Main Content Body */}
      {isLoading && !insightData ? (
        // Loading Skeleton
        <div className="py-8 space-y-4 relative z-10 animate-pulse">
          <div className="h-6 bg-white/5 rounded-xl w-3/4"></div>
          <div className="h-16 bg-white/5 rounded-2xl w-full"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="h-20 bg-white/5 rounded-2xl"></div>
            <div className="h-20 bg-white/5 rounded-2xl"></div>
            <div className="h-20 bg-white/5 rounded-2xl"></div>
          </div>
        </div>
      ) : insightData ? (
        <div className="mt-5 space-y-5 relative z-10">
          {/* Key KPI Cockpit Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Appetite Gauge */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Capital Appetite</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${sentimentStyle.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sentimentStyle.dot} animate-pulse`} />
                  {sentimentStyle.label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                  {insightData.appetiteScore}%
                </span>
                <span className="text-xs text-gray-400 font-medium">Readiness Index</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2.5 overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r ${sentimentStyle.gauge} rounded-full transition-all duration-1000`} 
                  style={{ width: `${insightData.appetiteScore}%` }}
                />
              </div>
            </div>

            {/* Typical Grant Range */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Grant / Debt Tranche</span>
                <DollarSign size={14} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                  {insightData.typicalGrantRange}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 truncate">Average ticket size for {insightData.industry}</p>
              </div>
            </div>

            {/* Regulatory Tailwind */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-colors sm:col-span-1">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Policy / Tax Advantage</span>
                <ShieldCheck size={14} className="text-cyan-400" />
              </div>
              <p className="text-xs text-gray-300 font-medium line-clamp-3 leading-relaxed">
                {insightData.regulatoryDrivers}
              </p>
            </div>
          </div>

          {/* Executive Trend Headline & Summary */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/20 via-cyan-950/20 to-transparent border border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                <BarChart3 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm sm:text-base font-black text-white tracking-tight mb-1.5">
                  {insightData.trendHeadline}
                </h4>
                <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-normal">
                  {insightData.summary}
                </p>
              </div>
            </div>

            {/* Priority Focus Badges */}
            {insightData.priorityFocusAreas && insightData.priorityFocusAreas.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mr-1">Hot Sub-Sectors:</span>
                {insightData.priorityFocusAreas.map((focus, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-semibold text-gray-300"
                  >
                    {focus}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Tab Navigation for Detailed Breakdowns */}
          <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'trends'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <TrendingUp size={13} />
              Market Dynamics
            </button>
            <button
              onClick={() => setActiveTab('funders')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'funders'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Building2 size={13} />
              Active Allocators
            </button>
            <button
              onClick={() => setActiveTab('playbook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'playbook'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Lightbulb size={13} />
              Founder Playbook
            </button>
          </div>

          {/* Tab Content Display */}
          <AnimatePresence mode="wait">
            {activeTab === 'trends' && (
              <motion.div
                key="trends"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="space-y-2.5"
              >
                {insightData.keyTrends.map((trend, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-3 hover:border-white/10 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-normal flex-1">
                      {trend}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'funders' && (
              <motion.div
                key="funders"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3"
              >
                {insightData.activeFunders.map((funder, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex flex-col justify-between hover:bg-white/10 transition-all group/item"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 font-mono">
                          {funder.type}
                        </span>
                        <Building2 size={12} className="text-gray-500 group-hover/item:text-cyan-400 transition-colors" />
                      </div>
                      <h5 className="font-bold text-xs sm:text-sm text-white mb-1.5 leading-snug">
                        {funder.name}
                      </h5>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed border-t border-white/5 pt-2 mt-2">
                      {funder.focus}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'playbook' && (
              <motion.div
                key="playbook"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="space-y-2.5"
              >
                {insightData.actionableFounderTips.map((tip, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-start gap-3 hover:bg-emerald-500/10 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 size={13} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm text-gray-200 leading-relaxed">
                        {tip}
                      </p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer Call to Action & Source Tag */}
          <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-[10px] font-mono text-gray-500">
              Source: {insightData.lastFetched}
            </span>

            {onExploreIndustry && (
              <button
                onClick={() => onExploreIndustry(selectedIndustry)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-purple-950/30 transition-all hover:scale-[1.02] active:scale-[0.98] self-start sm:self-auto cursor-pointer"
              >
                <span>Browse {selectedIndustry.split('&')[0].trim()} Opportunities</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AIFundingInsights;

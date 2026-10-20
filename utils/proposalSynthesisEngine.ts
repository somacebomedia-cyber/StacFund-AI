// utils/proposalSynthesisEngine.ts
// Intelligent offline domain synthesis engine for South African business funding proposals
// Allows StacFund users to generate comprehensive, funder-compliant proposals and pitch decks
// with ZERO external API keys or when external AI calls are unavailable.

import { FundingOpportunityDb } from '../types';

export interface ProposalUseOfFundItem {
  category: string;
  amount: string;
  percentage: number;
  description: string;
}

export interface ProposalMilestoneItem {
  phase: string;
  title: string;
  timeframe: string;
  deliverable: string;
}

export interface GeneratedProposalData {
  businessName: string;
  funderName: string;
  programmeName: string;
  generationSource: 'gemini' | 'synthesis';
  executiveSummary: string;
  marketAnalysis: {
    targetMarket: string;
    competitiveAdvantage: string;
    industrySector: string;
  };
  financialPlan: {
    fundingRequirement: string;
    totalAmountNumeric: number;
    useOfFunds: ProposalUseOfFundItem[];
    projectedRoiMonths: number;
    breakEvenSummary: string;
  };
  milestones: ProposalMilestoneItem[];
  complianceAndImpact: {
    jobCreationTarget: string;
    bbeeAlignment: string;
    cipcStatus: string;
    governanceNote: string;
  };
  conclusion: string;
}

interface GeneratorInput {
  businessName: string;
  registrationNumber?: string;
  fundingRequested: string;
  purpose: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  opportunity: Partial<FundingOpportunityDb>;
  userProfile?: any;
}

/**
 * Parses user input currency (e.g. "R500,000", "500000", "R 1.2M", "250k") into a numeric value.
 */
function parseRequestedAmount(input: string, fallbackMin?: number, fallbackMax?: number): number {
  if (!input) {
    if (fallbackMin && fallbackMax) return Math.round((fallbackMin + fallbackMax) / 2);
    if (fallbackMin) return fallbackMin;
    return 350000; // default R350,000
  }

  const cleaned = input.toLowerCase().replace(/r\s*/g, '').replace(/,/g, '').trim();

  if (cleaned.endsWith('m') || cleaned.endsWith('mil') || cleaned.endsWith('million')) {
    const num = parseFloat(cleaned);
    if (!isNaN(num)) return Math.round(num * 1_000_000);
  }

  if (cleaned.endsWith('k')) {
    const num = parseFloat(cleaned);
    if (!isNaN(num)) return Math.round(num * 1_000);
  }

  const numeric = parseFloat(cleaned);
  if (!isNaN(numeric) && numeric > 0) {
    return Math.round(numeric);
  }

  return 350000;
}

function formatZar(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Intelligent heuristic proposal synthesizer that constructs a tailored,
 * comprehensive business proposal without requiring an external AI API key.
 */
export function synthesizeProposal(input: GeneratorInput): GeneratedProposalData {
  const {
    businessName = 'Emerging Enterprise',
    registrationNumber,
    fundingRequested,
    purpose,
    opportunity,
    userProfile,
  } = input;

  const funder = opportunity.issuer_name || 'Funding Institution';
  const programme = opportunity.programme_name || 'Enterprise Development Programme';
  const targetStage = opportunity.target_stage || 'Early Stage to Growth';
  const rawFundingNumeric = parseRequestedAmount(
    fundingRequested,
    opportunity.amount_min,
    opportunity.amount_max
  );
  const formattedFunding = formatZar(rawFundingNumeric);

  const sector =
    opportunity.sector_tags?.[0] ||
    userProfile?.industry ||
    'Commercial & Technology Services';

  // Determine thematic focus from user's stated purpose
  const purposeLower = (purpose || '').toLowerCase();
  const isAgri = purposeLower.includes('farm') || purposeLower.includes('agri') || sector.toLowerCase().includes('agri');
  const isTech = purposeLower.includes('app') || purposeLower.includes('software') || purposeLower.includes('tech') || purposeLower.includes('digital') || sector.toLowerCase().includes('ict');
  const isManufacturing = purposeLower.includes('machin') || purposeLower.includes('manufactur') || purposeLower.includes('factory') || purposeLower.includes('produce');
  const isRetail = purposeLower.includes('store') || purposeLower.includes('shop') || purposeLower.includes('retail') || purposeLower.includes('stock');

  // Executive summary synthesis
  const purposeNarrative = purpose && purpose.trim().length > 15
    ? `The capital deployment directly addresses our priority mandate: ${purpose.trim().replace(/\.$/, '')}.`
    : `The capital deployment will accelerate operational scaling, inventory acquisition, and market reach across target consumer and commercial corridors in South Africa.`;

  const executiveSummary = `${businessName} is a high-potential South African commercial enterprise strategically positioned within the ${sector} sector. In partnership with ${funder}'s ${programme}, this proposal presents an actionable operational expansion roadmap designed to accelerate productive capacity, unlock scalable revenues, and catalyze sustainable direct employment.

${purposeNarrative} Over the past trading cycles, ${businessName} has validated strong demand dynamics, demonstrated operational resilience, and established rigorous compliance foundations, including formal registration (${registrationNumber || 'In good standing with CIPC'}) and proactive regulatory governance.

By securing ${formattedFunding} in targeted capital, ${businessName} will bridge critical capacity constraints, modernize infrastructure, and advance towards self-sustaining profitability within 12 to 18 months, directly contributing to South Africa's economic transformation and National Development Plan (NDP) goals.`;

  // Itemized fund breakdown summing strictly to 100% and exact total
  let categories: { category: string; pct: number; desc: string }[] = [];

  if (isAgri) {
    categories = [
      { category: 'Irrigation & Farming Machinery', pct: 0.35, desc: 'Specialized yield enhancement equipment and water conservation infrastructure.' },
      { category: 'Seed, Fertiliser & Biological Inputs', pct: 0.25, desc: 'High-grade seasonal seeds, organic soil nourishment, and harvest inputs.' },
      { category: 'Cold-Chain Storage & Packaging', pct: 0.20, desc: 'Post-harvest preservation units minimizing perishable wastage.' },
      { category: 'Working Capital & Logistics', pct: 0.20, desc: 'Haulage contracts, compliance testing, and initial field staff stipends.' },
    ];
  } else if (isTech) {
    categories = [
      { category: 'Engineering & Product Development', pct: 0.40, desc: 'Core platform architecture, mobile integration, and cloud security.' },
      { category: 'Customer Acquisition & Growth', pct: 0.25, desc: 'Targeted B2B outreach, regional pilot onboarding, and merchant acquisition.' },
      { category: 'Security, Compliance & IP', pct: 0.15, desc: 'POPIA data privacy governance, SSL/infrastructure auditing, and trademark filing.' },
      { category: 'Operational Working Capital', pct: 0.20, desc: 'Key technical talent compensation, cloud compute credits, and support operations.' },
    ];
  } else if (isManufacturing) {
    categories = [
      { category: 'Heavy Tooling & Industrial Equipment', pct: 0.45, desc: 'Precision CNC, fabrication, and semi-automated production lines.' },
      { category: 'Raw Material Inventory Buffer', pct: 0.25, desc: 'Bulk procurement of steel, polymers, or textiles at volume discounts.' },
      { category: 'Factory Floor Safety & SABS Testing', pct: 0.15, desc: 'Occupational health standards (OHSA), SABS quality certification.' },
      { category: 'Distribution & Working Capital', pct: 0.15, desc: 'Local dispatch, customer fulfillment, and commercial inventory insurance.' },
    ];
  } else if (isRetail) {
    categories = [
      { category: 'Commercial Stock & Bulk Procurement', pct: 0.45, desc: 'Fast-moving inventory procurement directly from tier-1 suppliers.' },
      { category: 'Point-of-Sale & Store Infrastructure', pct: 0.20, desc: 'Digital inventory scanning, POS terminals, and retail security display.' },
      { category: 'Regional Marketing & Footfall Drivers', pct: 0.15, desc: 'Hyper-local brand awareness, community activations, and online ordering.' },
      { category: 'Operational Reserves & Cashflow', pct: 0.20, desc: 'Lease deposits, retail staff wages, and municipal logistics utilities.' },
    ];
  } else {
    categories = [
      { category: 'Production & Operational Equipment', pct: 0.35, desc: 'Essential machinery and tooling to double current throughput capacity.' },
      { category: 'Direct Working Capital & Inventory', pct: 0.30, desc: 'Sourcing core supplies and funding customer order lead-times.' },
      { category: 'Market Expansion & Sales Channels', pct: 0.20, desc: 'Enterprise business development, channel partner agreements, and digital sales.' },
      { category: 'Quality Certifications & Compliance', pct: 0.15, desc: 'Industry accreditations, health & safety compliance, and financial accounting.' },
    ];
  }

  // Calculate exact amounts
  let allocatedSum = 0;
  const useOfFunds: ProposalUseOfFundItem[] = categories.map((cat, idx) => {
    if (idx === categories.length - 1) {
      // Reconcile rounding on last item to guarantee sum === rawFundingNumeric
      const remainingAmount = rawFundingNumeric - allocatedSum;
      const actualPct = Math.round((remainingAmount / rawFundingNumeric) * 100);
      return {
        category: cat.category,
        amount: formatZar(remainingAmount),
        percentage: actualPct,
        description: cat.desc,
      };
    }
    const itemAmount = Math.round(rawFundingNumeric * cat.pct);
    allocatedSum += itemAmount;
    return {
      category: cat.category,
      amount: formatZar(itemAmount),
      percentage: Math.round(cat.pct * 100),
      description: cat.desc,
    };
  });

  // Calculate realistic jobs projected based on funding size
  const projectedJobs = Math.max(3, Math.min(25, Math.round(rawFundingNumeric / 120000)));

  const milestones: ProposalMilestoneItem[] = [
    {
      phase: 'Phase 1',
      title: 'Disbursement & Asset Procurement',
      timeframe: 'Months 1 – 2',
      deliverable: `Receipt of funding tranche, competitive vendor bidding, purchase orders executed for ${categories[0].category.toLowerCase()}.`,
    },
    {
      phase: 'Phase 2',
      title: 'Facility Installation & Team Induction',
      timeframe: 'Months 3 – 5',
      deliverable: `Commissioning of new capacity, recruitment of ${Math.round(projectedJobs * 0.5)} initial local staff, and quality trial runs.`,
    },
    {
      phase: 'Phase 3',
      title: 'Commercial Scale & Revenue Ramp',
      timeframe: 'Months 6 – 9',
      deliverable: `Full commercial throughput activation, fulfilling active order backlog, and executing contracted distribution deals.`,
    },
    {
      phase: 'Phase 4',
      title: 'Breakeven, Sustainability & Auditing',
      timeframe: 'Months 10 – 12',
      deliverable: `Achieving operational cashflow breakeven, submitting audited utilization reports to ${funder}, and retaining ${projectedJobs} full-time jobs.`,
    },
  ];

  const conclusion = `With structured deployment of the requested ${formattedFunding}, ${businessName} presents a de-risked, high-impact investment profile for ${funder}'s ${programme}. We welcome the opportunity to submit our complete compliance pack, verify technical specifications, and finalize the contractual terms for implementation.`;

  return {
    businessName,
    funderName: funder,
    programmeName: programme,
    generationSource: 'synthesis',
    executiveSummary,
    marketAnalysis: {
      targetMarket: `Underserved enterprise and consumer segments across provincial and metropolitan economic nodes, currently experiencing high demand for reliable, locally manufactured and distributed solutions.`,
      competitiveAdvantage: `Agile local turnaround times, lower overhead cost structure, direct community trust, and compliance readiness aligned with ${funder}'s mandate.`,
      industrySector: `${sector} (${targetStage})`,
    },
    financialPlan: {
      fundingRequirement: formattedFunding,
      totalAmountNumeric: rawFundingNumeric,
      useOfFunds,
      projectedRoiMonths: 14,
      breakEvenSummary: `Projected unit economics indicate operational breakeven within 9 to 12 months post-capital installation, with net operating margins expanding to 22-28% at steady-state capacity.`,
    },
    milestones,
    complianceAndImpact: {
      jobCreationTarget: `${projectedJobs} Direct & Indirect Sustainable Jobs`,
      bbeeAlignment: 'Priority alignment with Broad-Based Black Economic Empowerment (B-BBEE) supplier and socio-economic developmental codes.',
      cipcStatus: registrationNumber ? `CIPC Registration: ${registrationNumber}` : 'Incorporated in good standing under the Companies Act',
      governanceNote: 'Monthly financial reporting, segregation of grant/loan capital in designated project accounts, and periodic funder progress audits.',
    },
    conclusion,
  };
}

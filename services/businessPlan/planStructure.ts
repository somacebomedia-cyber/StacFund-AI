// services/businessPlan/planStructure.ts
/**
 * StacFund — Canonical business-plan chapter catalog
 * ==================================================
 * The Venturekit-class document structure, adapted for South African
 * funding applications. 14 chapters; each chapter has:
 *
 *   - REQUIRED subsections (always present)
 *   - an EXPANSION POOL (extra subsections activated by the depth engine —
 *     a R150k micro application activates few; a R30m IDC facility
 *     activates nearly all)
 *
 * Three chapter families are AI-SHAPED rather than fixed (their subsection
 * lists depend on the business itself): business models, audience personas
 * and product/service offerings. The outline call proposes those; everything
 * else is selected deterministically from this catalog.
 */

export interface SubsectionTemplate {
  /** Stable pool id — used for AI title-tailoring and dedupe in deepen passes. */
  poolId: string;
  title: string;
  brief: string;
  /** Which blocks the fill call should emit (shape contract). */
  recipe: string;
  /** Droppable when the plan runs past the 120-page ceiling. */
  optional?: boolean;
}

export interface ChapterTemplate {
  id: string;
  title: string;
  summary: string;
  required: SubsectionTemplate[];
  pool: SubsectionTemplate[];
  /** AI-shaped family: subsections proposed by the outline call. */
  aiShaped?: 'models' | 'personas' | 'offerings';
}

// ─── The catalog ─────────────────────────────────────────────────────────────

export const CHAPTER_CATALOG: ChapterTemplate[] = [
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    summary: 'The whole plan on two pages: who the business is, the opportunity, the numbers, and exactly what is being asked of the funder.',
    required: [
      {
        poolId: 'executive_summary',
        title: 'Executive Summary',
        brief: 'Who the business is, what it does, the market opportunity, headline financials, and the funding ask — written so a committee member who reads nothing else still votes yes.',
        recipe: '4 to 6 paragraphs (80–130 words each), then ONE stats row (3–4 chips: e.g. requested amount, jobs to be created, Year-3 revenue, market size), then ONE callout naming the funder programme and the exact amount requested.',
      },
    ],
    pool: [],
  },
  {
    id: 'company_overview',
    title: 'Company Overview',
    summary: 'The business as an entity: what it does, where it operates, how it is structured, and the story of how it got here.',
    required: [
      {
        poolId: 'overview_description',
        title: 'Business Description',
        brief: 'What the business does today, who it serves, and where it operates — the factual foundation for everything that follows.',
        recipe: '3 to 5 paragraphs, then ONE twoCol block (left: "What we do today", right: "Where we are heading").',
      },
      {
        poolId: 'mission_vision',
        title: 'Mission, Vision & Values',
        brief: 'The mission statement, the five-year vision, and the operating values that shape decisions.',
        recipe: '1 to 2 paragraphs of introduction, then ONE kv block titled with rows for Mission / Vision / Values, then 1 short closing paragraph.',
      },
      {
        poolId: 'legal_ownership',
        title: 'Legal Structure & Ownership',
        brief: 'Registered entity details, shareholding or member structure, B-BBEE and youth/women ownership percentages where relevant.',
        recipe: '2 to 3 paragraphs, then ONE table (columns: Detail / Information; rows: registration number, entity type, date registered, ownership split, B-BBEE status, tax status) with [placeholders] in square brackets for details the applicant must confirm.',
      },
    ],
    pool: [
      {
        poolId: 'history_milestones',
        title: 'History & Milestones',
        brief: 'How the business started and the milestones reached so far.',
        recipe: '2 to 4 paragraphs, then ONE table (columns: Year / Milestone / Why it mattered).',
        optional: true,
      },
      {
        poolId: 'premises_location',
        title: 'Premises & Location',
        brief: 'Where the business operates from, the premises arrangement, and why the location is strategic.',
        recipe: '2 to 3 paragraphs, then ONE kv block (rows: Physical address / Lease or owned / Size / Why this location).',
        optional: true,
      },
    ],
  },
  {
    id: 'swot_analysis',
    title: 'SWOT Analysis',
    summary: 'An honest internal and external assessment: strengths to press, weaknesses to fix, opportunities to chase, threats to defend against.',
    required: [
      {
        poolId: 'swot_grid',
        title: 'SWOT Overview',
        brief: 'The full SWOT assessment with 4 to 6 specific points per quadrant.',
        recipe: '1 short lead paragraph, then ONE swot block (4–6 items per quadrant, each item a full sentence with specifics — no single-word entries).',
      },
      {
        poolId: 'swot_implications',
        title: 'What This Means for the Plan',
        brief: 'How the business will press its strengths and manage its weaknesses and threats — the bridge from analysis to strategy.',
        recipe: '3 to 4 paragraphs. Reference the quadrants explicitly.',
      },
    ],
    pool: [],
  },
  {
    id: 'business_models',
    title: 'Business Models',
    summary: 'The ways this business could organise itself to make money and deliver impact — and the model it is actually choosing, and why.',
    aiShaped: 'models',
    required: [
      {
        poolId: 'models_overview',
        title: 'Models Considered',
        brief: 'Introduction to the candidate business models evaluated for this business.',
        recipe: '2 to 3 paragraphs explaining why several models were evaluated and the evaluation criteria.',
      },
      {
        poolId: 'recommended_model',
        title: 'Recommended Model & Why',
        brief: 'The model the business is committing to, and the reasoning.',
        recipe: '3 to 4 paragraphs, then ONE callout stating the chosen model in one sentence.',
      },
    ],
    pool: [],
  },
  {
    id: 'viability_analysis',
    title: 'Viability Analysis',
    summary: 'The reasoned case that this business can work: demand, capability, and financial logic — with a stated viability score.',
    required: [
      {
        poolId: 'viability_assessment',
        title: 'Viability Assessment',
        brief: 'Market demand, execution capability, and financial logic — the case that this business is viable, with honest caveats.',
        recipe: '5 to 7 paragraphs covering demand, capability, financial logic and risks to viability, then ONE stats row (3 chips, ending with a viability score chip like "82/100 — Strong"), then ONE sources block listing the evidence sources cited.',
      },
    ],
    pool: [],
  },
  {
    id: 'market_research',
    title: 'Market Research',
    summary: 'The industry, the customers, the size of the prize, and the competition — grounded in South African data.',
    aiShaped: 'personas',
    required: [
      {
        poolId: 'industry_overview',
        title: 'Industry Overview',
        brief: 'The state of the industry in South Africa: size, structure, trends, and the forces shaping it.',
        recipe: '4 to 6 paragraphs, then ONE stats row (3–4 chips with ZAR figures or percentages), then ONE sources block (e.g. Stats SA, industry bodies).',
      },
      {
        poolId: 'market_size',
        title: 'Market Size & Trends',
        brief: 'TAM / SAM / SOM for this business in Rand terms, and the trends that make now the right time.',
        recipe: '3 to 5 paragraphs, then ONE stats row (TAM / SAM / SOM in ZAR), then ONE chart (bar chart of the three market layers or line chart of the core trend), then ONE sources block.',
      },
      {
        poolId: 'competitor_analysis',
        title: 'Competitor Analysis',
        brief: 'Who the real competitors are, how they are positioned, and where the gap is.',
        recipe: '2 to 3 paragraphs, then ONE table (first column: dimension e.g. Pricing / Quality / Reach; remaining 3–4 columns: named competitors plus this business), then 1 to 2 paragraphs on the competitive gap.',
      },
    ],
    pool: [
      {
        poolId: 'market_gaps',
        title: 'Market Gaps & Unmet Demand',
        brief: 'The specific unmet needs in the market this business will exploit.',
        recipe: '3 to 4 paragraphs, then ONE bullets block titled "Gaps we will exploit" (4–5 bullets).',
        optional: true,
      },
      {
        poolId: 'regulatory_environment',
        title: 'Regulatory & Policy Environment',
        brief: 'The regulation and policy affecting this market — and what changes are coming.',
        recipe: '3 to 4 paragraphs, then ONE twoCol block (left: "Current requirements", right: "Proposed changes to watch").',
        optional: true,
      },
      {
        poolId: 'seasonal_trends',
        title: 'Seasonality & Cyclicality',
        brief: 'How demand moves through the year and across economic cycles.',
        recipe: '2 to 3 paragraphs, then ONE chart (line chart across 12 months with two series if useful).',
        optional: true,
      },
    ],
  },
  {
    id: 'products_services',
    title: 'Products & Services',
    summary: 'Everything the business sells — the core offerings, the supporting lines, and the expansion candidates.',
    aiShaped: 'offerings',
    required: [
      {
        poolId: 'secondary_offerings',
        title: 'Secondary Offerings',
        brief: 'The supporting products and services that round out the core offer and deepen customer relationships.',
        recipe: '1 lead paragraph, then 2 to 3 offerings each as: ONE heading + 1 to 2 paragraphs + ONE twoCol (Advantages / Challenges).',
      },
      {
        poolId: 'expansion_opportunities',
        title: 'Expansion Opportunities',
        brief: 'Offerings and lines the business could add in years two to five.',
        recipe: '1 lead paragraph, then ONE table (columns: Opportunity / Timing / Investment needed / Revenue potential), then 2 paragraphs on the most promising one.',
      },
    ],
    pool: [
      {
        poolId: 'customer_service',
        title: 'Customer Service Approach',
        brief: 'How customers are served, supported and retained at the service level.',
        recipe: '3 to 4 paragraphs, then ONE kv block (rows: Response standard / Support channels / Complaints handling / Satisfaction tracking).',
        optional: true,
      },
      {
        poolId: 'quality_assurance',
        title: 'Quality & Standards',
        brief: 'The quality standards and assurance processes the business holds itself to.',
        recipe: '3 paragraphs, then ONE bullets block titled "Quality commitments" (4–5 bullets).',
        optional: true,
      },
      {
        poolId: 'competitive_positioning',
        title: 'Positioning & Differentiation',
        brief: 'How the total offer is positioned against alternatives in the customer\u2019s mind.',
        recipe: '3 to 4 paragraphs, then ONE callout with the positioning statement in one sentence.',
        optional: true,
      },
    ],
  },
  {
    id: 'sales_marketing',
    title: 'Sales & Marketing',
    summary: 'How customers will find this business, choose it, and keep coming back.',
    required: [
      {
        poolId: 'marketing_overview',
        title: 'Marketing Strategy Overview',
        brief: 'The marketing strategy in one view: objectives, positioning and the channel mix.',
        recipe: '4 to 5 paragraphs, then ONE stats row (3–4 chips: e.g. target customers, Year-1 marketing budget, cost per acquisition target).',
      },
      {
        poolId: 'branding_identity',
        title: 'Branding & Identity',
        brief: 'The brand: name meaning, visual identity, tone, and what it promises.',
        recipe: '3 to 4 paragraphs, then ONE kv block (rows: Brand promise / Tone of voice / Visual identity / Tagline direction).',
      },
      {
        poolId: 'online_presence',
        title: 'Online Presence',
        brief: 'Website, listings and the digital storefront strategy.',
        recipe: '3 to 4 paragraphs, then ONE bullets block titled "Online channels planned" (4–6 bullets).',
      },
    ],
    pool: [
      {
        poolId: 'social_media',
        title: 'Social Media Strategy',
        brief: 'Platforms, content themes, cadence and community management.',
        recipe: '3 to 4 paragraphs, then ONE table (columns: Platform / Content focus / Posting cadence / Success metric).',
        optional: true,
      },
      {
        poolId: 'seo_content',
        title: 'SEO & Content',
        brief: 'How the business will win search and build authority through content.',
        recipe: '3 to 4 paragraphs, then ONE twoCol (left: "Quick wins", right: "Long-term plays").',
        optional: true,
      },
      {
        poolId: 'digital_marketing',
        title: 'Paid Digital Marketing',
        brief: 'Paid channels, budgets and expected returns.',
        recipe: '3 paragraphs, then ONE table (columns: Channel / Monthly budget / Target cost per result / Expected volume).',
        optional: true,
      },
      {
        poolId: 'community_engagement',
        title: 'Community Engagement',
        brief: 'Ground game: community, partnerships, events and word of mouth.',
        recipe: '3 to 4 paragraphs, then ONE bullets block titled "Community activities" (4–5 bullets).',
        optional: true,
      },
      {
        poolId: 'customer_retention',
        title: 'Customer Retention',
        brief: 'Keeping customers: repeat rates, loyalty, referral engines.',
        recipe: '3 to 4 paragraphs, then ONE stats row (3 chips: e.g. repeat purchase target, referral rate, churn ceiling).',
        optional: true,
      },
      {
        poolId: 'sales_process',
        title: 'Sales Process & Pipeline',
        brief: 'How a lead becomes a customer, step by step.',
        recipe: '3 paragraphs, then ONE table (columns: Stage / What happens / Owner / Target conversion).',
        optional: true,
      },
    ],
  },
  {
    id: 'financial_plan',
    title: 'Financial Plan',
    summary: 'The numbers a credit committee reads first: revenue, costs, projections, cash flow, and exactly what the funding buys.',
    required: [
      {
        poolId: 'revenue_model',
        title: 'Revenue Model',
        brief: 'How the business makes money: streams, pricing logic and revenue concentration.',
        recipe: '3 to 4 paragraphs, then ONE table (columns: Revenue stream / Pricing basis / Year-1 contribution / Year-3 contribution), then ONE chart (bar or line: projected revenue by year, 3–5 years).',
      },
      {
        poolId: 'expenses',
        title: 'Operating Expenses',
        brief: 'The full cost base: fixed, variable and one-off costs.',
        recipe: '2 to 3 paragraphs, then ONE table (columns: Expense category / Monthly (R) / Annual (R) / Type — fixed or variable), then 1 paragraph on cost control.',
      },
      {
        poolId: 'profit_loss',
        title: 'Profit & Loss Projection',
        brief: 'Three to five year income statement projection with stated assumptions.',
        recipe: '2 paragraphs, then ONE table (columns: Item / Year 1 / Year 2 / Year 3 with rows: Revenue, Cost of sales, Gross profit, Operating expenses, EBITDA, Net profit), then 1 paragraph interpreting the trajectory. Use [placeholders] where applicant figures are needed and keep the arithmetic internally consistent.',
      },
      {
        poolId: 'cash_flow',
        title: 'Cash Flow Projection',
        brief: 'Monthly cash movement in Year 1 and the seasonal picture beyond.',
        recipe: '2 paragraphs, then ONE chart (line chart, two series: monthly inflows and outflows for Year 1), then 1 paragraph on the cash low point and how it is bridged.',
      },
      {
        poolId: 'funding_plan',
        title: 'Funding Requirement & Use of Funds',
        brief: 'The exact amount requested and the itemised, priced breakdown of what it buys.',
        recipe: '2 to 3 paragraphs, then ONE table (columns: Use of funds item / Amount (R) / % of total; rows must sum to the requested amount), then ONE callout confirming the total matches the amount requested from the funder.',
      },
    ],
    pool: [
      {
        poolId: 'pricing_strategy',
        title: 'Pricing Strategy',
        brief: 'How prices are set, how they compare to alternatives, and the margin logic.',
        recipe: '3 to 4 paragraphs, then ONE twoCol (left: "Our pricing model", right: "Market comparison").',
        optional: true,
      },
      {
        poolId: 'break_even',
        title: 'Break-Even Analysis',
        brief: 'The units and Rand value needed to cover all costs.',
        recipe: '2 to 3 paragraphs, then ONE stats row (3 chips: break-even monthly revenue, break-even units, months to break even), then ONE chart (line: revenue vs total cost crossing).',
        optional: true,
      },
      {
        poolId: 'financing_structure',
        title: 'Financing Structure & Alternatives',
        brief: 'The current and proposed capital structure, and alternatives considered.',
        recipe: '3 to 4 paragraphs, then ONE table (columns: Source / Amount (R) / Cost / Security or equity).',
        optional: true,
      },
      {
        poolId: 'balance_sheet',
        title: 'Balance Sheet Projection',
        brief: 'Assets, liabilities and equity position over the projection period.',
        recipe: '2 paragraphs, then ONE table (columns: Item / Opening / Year 1 / Year 2 / Year 3 with rows for the main categories).',
        optional: true,
      },
      {
        poolId: 'taxes_compliance_fin',
        title: 'Tax & Statutory Costs',
        brief: 'Company tax, VAT registration thresholds, PAYE/UIF and other statutory costs factored into projections.',
        recipe: '3 to 4 paragraphs, then ONE kv block (rows: VAT status / Company tax rate applied / PAYE / UIF / Other levies). South African rates only.',
        optional: true,
      },
      {
        poolId: 'financial_assumptions',
        title: 'Key Assumptions',
        brief: 'Every material assumption behind the projections, stated honestly.',
        recipe: '1 lead paragraph, then ONE table (columns: Assumption / Basis / Sensitivity — low/med/high), then 1 paragraph on downside sensitivity.',
        optional: true,
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    summary: 'How the business actually runs: process, people, suppliers and capacity.',
    required: [
      {
        poolId: 'operations_plan',
        title: 'Operations Plan',
        brief: 'The operating rhythm: production or service delivery, capacity, quality control and logistics.',
        recipe: '4 to 6 paragraphs, then ONE kv block (rows: Operating hours / Capacity per month / Key equipment / Quality control / Logistics).',
      },
      {
        poolId: 'team_roles',
        title: 'Team & Roles',
        brief: 'Who runs the business: the people, their roles, and the gaps to be hired.',
        recipe: '2 to 3 paragraphs, then ONE table (columns: Role / Person / Responsibility / Status — current or to hire), then 1 paragraph on skills development.',
      },
    ],
    pool: [
      {
        poolId: 'suppliers_partners',
        title: 'Suppliers & Key Partners',
        brief: 'Who the business buys from and partners with, and the terms.',
        recipe: '3 paragraphs, then ONE table (columns: Supplier or partner / What they provide / Terms / Backup plan).',
        optional: true,
      },
      {
        poolId: 'technology_systems',
        title: 'Technology & Systems',
        brief: 'The systems that run the business: POS, accounting, communication, tools.',
        recipe: '3 paragraphs, then ONE bullets block titled "Systems stack" (4–6 bullets).',
        optional: true,
      },
      {
        poolId: 'capacity_scaling',
        title: 'Capacity & Scaling',
        brief: 'What the current setup can handle, and the trigger points for expansion.',
        recipe: '3 to 4 paragraphs, then ONE table (columns: Stage / Trigger / What gets added / Cost).',
        optional: true,
      },
    ],
  },
  {
    id: 'risk_analysis',
    title: 'Risk Analysis',
    summary: 'What could go wrong, how likely it is, what it would cost, and what is being done about it.',
    required: [
      {
        poolId: 'risk_matrix',
        title: 'Risk Register & Mitigation',
        brief: 'The full risk register with likelihood, impact and concrete mitigation for each risk.',
        recipe: '1 lead paragraph, then ONE table (columns: Risk / Likelihood (Low/Med/High) / Impact (Low/Med/High) / Mitigation; 8–12 rows covering market, financial, operational, people, regulatory and technology risks), then 2 to 3 paragraphs on the three risks that matter most.',
      },
    ],
    pool: [
      {
        poolId: 'scenario_planning',
        title: 'Scenario Planning',
        brief: 'Base, downside and upside cases with the numbers.',
        recipe: '2 paragraphs, then ONE table (columns: Scenario / Revenue change / Profit impact / Management response).',
        optional: true,
      },
      {
        poolId: 'contingency_plan',
        title: 'Contingency Plans',
        brief: 'What the business does if the worst materialises.',
        recipe: '3 to 4 paragraphs, then ONE twoCol (left: "If this happens", right: "We respond by").',
        optional: true,
      },
    ],
  },
  {
    id: 'regulatory_compliance',
    title: 'Regulatory Compliance',
    summary: 'Every licence, registration and statute that applies — and the document checklist for this application.',
    required: [
      {
        poolId: 'regulatory_sa',
        title: 'Regulatory Requirements',
        brief: 'South African registrations, licences and laws that apply to this business: CIPC, SARS, B-BBEE, sector licences, labour and POPIA.',
        recipe: '4 to 6 paragraphs, then ONE table (columns: Requirement / Status / Responsible / Next action; rows for CIPC annual return, SARS tax clearance, VAT if applicable, B-BBEE affidavit or certificate, sector licence, POPIA, basic employment conditions). Use [placeholders] for details the applicant must confirm.',
      },
    ],
    pool: [],
  },
  {
    id: 'implementation_plan',
    title: 'Implementation Plan',
    summary: 'From approval to full operation: what happens in the first 90 days, the first year, and the next five.',
    required: [
      {
        poolId: 'pre_launch',
        title: 'Pre-Launch (First 90 Days)',
        brief: 'The immediate actions once funding is approved.',
        recipe: '2 paragraphs, then ONE table (columns: Weeks / Action / Owner / Done by), then 1 paragraph on dependencies.',
      },
      {
        poolId: 'post_launch',
        title: 'Post-Launch (Months 4–12)',
        brief: 'The first full operating year, quarter by quarter.',
        recipe: '2 paragraphs, then ONE table (columns: Quarter / Focus / Key targets).',
      },
      {
        poolId: 'five_year_plan',
        title: 'Five-Year Plan',
        brief: 'The growth path over five years: revenue, jobs, footprint.',
        recipe: '2 to 3 paragraphs, then ONE table (columns: Year / Revenue target (R) / Headcount / Footprint or capacity), then ONE chart (line: revenue and headcount over five years — two series).',
      },
    ],
    pool: [],
  },
  {
    id: 'impact_alignment',
    title: 'Impact & Funder Alignment',
    summary: 'What this funding does for South Africa — jobs, transformation, community — and how it maps to this funder\u2019s exact mandate.',
    required: [
      {
        poolId: 'jobs_impact',
        title: 'Job Creation & Skills',
        brief: 'Direct and indirect jobs, youth and women employment, and skills development.',
        recipe: '3 to 4 paragraphs, then ONE table (columns: Year / Direct jobs / Youth / Women / Skills spend), then ONE stats row (3 chips: total jobs by Year 3, youth %, women %).',
      },
      {
        poolId: 'funder_alignment',
        title: 'Alignment with the Funder\u2019s Mandate',
        brief: 'How this application maps to the specific funder programme, its tiers and its published requirements.',
        recipe: '3 to 5 paragraphs that explicitly reference the funder programme, its funding tiers and requirements from the context block. Then ONE table (columns: Funder requirement / How this application meets it). Close with ONE callout: one-sentence statement of alignment.',
      },
    ],
    pool: [
      {
        poolId: 'community_impact',
        title: 'Community & Socio-Economic Impact',
        brief: 'The wider community impact beyond direct jobs.',
        recipe: '3 to 4 paragraphs, then ONE bullets block titled "Community outcomes" (4–5 bullets).',
        optional: true,
      },
      {
        poolId: 'transformation_bee',
        title: 'Transformation & B-BBEE',
        brief: 'The business\u2019s contribution to economic transformation: ownership, procurement, employment equity.',
        recipe: '3 to 4 paragraphs, then ONE kv block (rows: Ownership / Management control / Preferential procurement / Enterprise development).',
        optional: true,
      },
      {
        poolId: 'environmental_sustainability',
        title: 'Environmental Sustainability',
        brief: 'Environmental impact and sustainability practices.',
        recipe: '3 paragraphs, then ONE twoCol (left: "Current practice", right: "Planned improvements").',
        optional: true,
      },
    ],
  },
];

// ─── Selection helpers ───────────────────────────────────────────────────────

/** All pool ids in the catalog (for dedupe during deepen passes). */
export function allPoolIds(): Set<string> {
  const ids = new Set<string>();
  for (const c of CHAPTER_CATALOG) {
    for (const s of c.required) ids.add(s.poolId);
    for (const s of c.pool) ids.add(s.poolId);
  }
  return ids;
}

export function findChapterTemplate(chapterId: string): ChapterTemplate | undefined {
  return CHAPTER_CATALOG.find((c) => c.id === chapterId);
}

/**
 * How many pool subsections a chapter activates at a given expansion ratio.
 * Pool items are taken in catalog order (they are ordered by priority).
 */
export function poolTakeCount(chapter: ChapterTemplate, expansionRatio: number): number {
  if (!chapter.pool.length) return 0;
  return Math.min(chapter.pool.length, Math.round(expansionRatio * chapter.pool.length + 0.001));
}

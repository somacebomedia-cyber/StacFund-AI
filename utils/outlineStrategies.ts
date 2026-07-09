export interface SlideOutline {
  id: string;
  title: string;
  type: 'cover' | 'content' | 'data' | 'quote';
  layout: string;
  copyFormula: string;
  emotion: string;
  role: string;
  points: string[];
  visualPrompt: string;
  guidance?: string;
}

export type OutlineSlide = SlideOutline;
export type SlideLayout = string;
export type CopyFormula = string;
export type Emotion = string;
export type SlideRole = string;

export interface PitchStrategy {
  id: string;
  name: string;
  description: string;
  slides: Omit<SlideOutline, 'id' | 'points' | 'visualPrompt'>[];
}

export type OutlineStrategy = PitchStrategy;

export const PITCH_STRATEGIES: PitchStrategy[] = [
  {
    id: 'sa-funding',
    name: 'SA Funding Pitch (Local Standard)',
    description: 'Tailored for South African public and private funding institutions (Seda, sefa, NEF, IDC, banks). Emphasizes local economic development, BEE compliance, and jobs.',
    slides: [
      { title: 'Executive Introduction', type: 'cover', layout: 'heroic-split', copyFormula: 'Vision + South African Context', emotion: 'Confident & Inspiring', role: 'Establish identity and mission' },
      { title: 'The Local Market Problem', type: 'content', layout: 'problem-split', copyFormula: 'Pain Point + Local Relevance', emotion: 'Empathetic & Urgent', role: 'Explain the market need' },
      { title: 'Our Proposed Solution', type: 'content', layout: 'solution-grid', copyFormula: 'Features + Unique Value Proposition', emotion: 'Resolving & Authoritative', role: 'Describe our product/service' },
      { title: 'Socio-Economic Impact', type: 'data', layout: 'impact-bento', copyFormula: 'Jobs Created + BBBEE Alignment', emotion: 'Proud & Socially Conscious', role: 'Highlight community development and employment' },
      { title: 'South African Market Size', type: 'data', layout: 'market-funnel', copyFormula: 'TAM-SAM-SOM in ZAR', emotion: 'Fact-driven & Analytical', role: 'Show size of opportunity' },
      { title: 'The Business Model', type: 'content', layout: 'business-flow', copyFormula: 'Revenue Streams + Pricing', emotion: 'Pragmatic & Logical', role: 'Explain how we make money' },
      { title: 'Funding Ask & Allocation', type: 'data', layout: 'ask-pie', copyFormula: 'Requested ZAR + Breakdown', emotion: 'Transparent & Accountable', role: 'State the funding requirements and use of funds' },
      { title: 'Financial Projections (3-Year)', type: 'data', layout: 'financial-chart', copyFormula: 'Revenue + Margin Growth', emotion: 'Optimistic but Realistic', role: 'Show future growth trajectory' },
      { title: 'Compliance & Implementation', type: 'content', layout: 'compliance-list', copyFormula: 'CIPC + SARS Tax + BEE Status', emotion: 'Reassuring & Compliant', role: 'Show readiness and legal compliance' }
    ]
  },
  {
    id: 'yc-seed',
    name: 'YC Seed Pitch (Silicon Valley Style)',
    description: 'High-energy, hyper-focused structure favored by accelerators like Y Combinator. Moves rapidly from problem/solution to traction and team.',
    slides: [
      { title: 'Company Name & Mission', type: 'cover', layout: 'minimal-centered', copyFormula: 'X for Y (High Concept Pitch)', emotion: 'Ambitious & Direct', role: 'Instant clarity on what you do' },
      { title: 'The Massive Problem', type: 'content', layout: 'problem-split', copyFormula: 'Huge, Growing, Expensive Pain', emotion: 'Urgent & Compelling', role: 'Prove this is a hair-on-fire problem' },
      { title: 'Our Solution', type: 'content', layout: 'solution-grid', copyFormula: 'Simple, Elegant, Scalable Product', emotion: 'Clear & Empowering', role: 'Introduce the breakthrough product' },
      { title: 'Hyper-Growth Traction', type: 'data', layout: 'hockey-stick', copyFormula: 'MoM Growth / Active Users', emotion: 'Victorious & Analytical', role: 'Show early product-market fit' },
      { title: 'Market Opportunity', type: 'data', layout: 'market-funnel', copyFormula: 'Massive Top-Down TAM', emotion: 'Excited & Grand', role: 'Prove this can be a billion-dollar company' },
      { title: 'Why Now?', type: 'content', layout: 'market-shift', copyFormula: 'Industry Tailwinds + Tech Shifts', emotion: 'Opportunistic & Urgent', role: 'Explain why this is the perfect moment' },
      { title: 'The Dream Team', type: 'content', layout: 'team-grid', copyFormula: 'Founders + Pedigree + Skills', emotion: 'Cohesive & Formidable', role: 'Show you have the unique ability to execute' },
      { title: 'The Seed Ask', type: 'data', layout: 'ask-pie', copyFormula: 'Milestones + Capital Required', emotion: 'Bold & Direct', role: 'State the investment round details' }
    ]
  },
  {
    id: 'kawasaki',
    name: 'Kawasaki 10/20/30 Rule',
    description: 'The legendary Guy Kawasaki pitch layout: exactly 10 slides, 20 minutes, 30pt font. Simple, highly memorable, and universally accepted.',
    slides: [
      { title: 'Title & Contact Info', type: 'cover', layout: 'minimal-centered', copyFormula: 'Brand Name + Slogan', emotion: 'Professional & Accessible', role: 'Standard introduction' },
      { title: 'Problem & Opportunity', type: 'content', layout: 'problem-split', copyFormula: 'User Pain + Market Opportunity', emotion: 'Empathetic & Urgent', role: 'Identify the gap' },
      { title: 'Value Proposition', type: 'content', layout: 'solution-grid', copyFormula: 'Core Value + Core Technology', emotion: 'Resolving & Authoritative', role: 'Explain the fundamental value' },
      { title: 'Underlying Magic', type: 'content', layout: 'tech-diagram', copyFormula: 'Our Secret Sauce / Tech Stack', emotion: 'Excited & Intellectual', role: 'Explain the technology or secret' },
      { title: 'Business Model', type: 'content', layout: 'business-flow', copyFormula: 'How we make money and who pays', emotion: 'Pragmatic & Confident', role: 'Financial engine overview' },
      { title: 'Go-to-Market Plan', type: 'content', layout: 'marketing-pillars', copyFormula: 'Marketing + Customer Acquisition', emotion: 'Strategic & Ambitious', role: 'Explain how you reach customers' },
      { title: 'Competitive Analysis', type: 'data', layout: 'matrix-chart', copyFormula: 'Our Advantage vs Competitors', emotion: 'Objective & Peerless', role: 'Compare with the market landscape' },
      { title: 'Our Team', type: 'content', layout: 'team-grid', copyFormula: 'Key Members + Relevant Successes', emotion: 'Capable & Warm', role: 'Introduce the core crew' },
      { title: 'Financial Projections', type: 'data', layout: 'financial-chart', copyFormula: '3-Year Revenues + Core Drivers', emotion: 'Analytical & Grounded', role: 'Forecast performance' },
      { title: 'Status, Timeline & Use of Funds', type: 'data', layout: 'milestone-line', copyFormula: 'Current Traction + Funding Ask', emotion: 'Action-oriented', role: 'Action plan and investment ask' }
    ]
  },
  {
    id: 'sales',
    name: 'Consultative Sales Pitch',
    description: 'Designed for pitching products or enterprise services directly to B2B clients. Focuses on client alignment, trust, and clear ROI.',
    slides: [
      { title: 'Joint Success Partnership', type: 'cover', layout: 'heroic-split', copyFormula: 'Client Name + Our Solution', emotion: 'Partner-focused & Warm', role: 'Frame the pitch as a collaborative effort' },
      { title: 'Your Critical Challenges', type: 'content', layout: 'problem-split', copyFormula: 'Client Obstacles + Financial Impact', emotion: 'Deeply Empathetic', role: 'Show total alignment with client pain' },
      { title: 'Tailored Partnership Solution', type: 'content', layout: 'solution-grid', copyFormula: 'How we solve your specific challenges', emotion: 'Empowering & Capable', role: 'Detail product capabilities mapped to needs' },
      { title: 'Demonstrated Client ROI', type: 'data', layout: 'impact-bento', copyFormula: 'Cost Savings + Speed / Growth', emotion: 'Reassuring & Solid', role: 'Quantify the return on investment' },
      { title: 'Proven Case Studies', type: 'quote', layout: 'testimonial-quote', copyFormula: 'Client Quote + Metric Improvement', emotion: 'Grateful & Validated', role: 'Establish third-party credibility' },
      { title: 'Implementation Timeline', type: 'content', layout: 'compliance-list', copyFormula: 'Kickoff to Go-Live in 3 Phases', emotion: 'Structured & Reliable', role: 'Lay out a frictionless transition plan' },
      { title: 'Commercial Proposal', type: 'data', layout: 'financial-chart', copyFormula: 'Tiered Pricing + Client Selection', emotion: 'Fair & Mutually Beneficial', role: 'State the investment required from client' }
    ]
  },
  {
    id: 'product',
    name: 'Product Demo & Launch',
    description: 'Optimized for physical or digital product launches. Places the spotlight on aesthetics, user experience, and spectacular product features.',
    slides: [
      { title: 'Introducing our New Product', type: 'cover', layout: 'heroic-split', copyFormula: 'Product Name + One Sentence Description', emotion: 'Awe-inspiring & Sleek', role: 'Create a wow factor immediately' },
      { title: 'The Way it Used to Be', type: 'content', layout: 'problem-split', copyFormula: 'Clunky, Outdated Alternatives', emotion: 'Frustrated & Disappointed', role: 'Highlight how bad existing products are' },
      { title: 'Behold the Experience', type: 'content', layout: 'solution-grid', copyFormula: 'Core Product Walkthrough / Screenshots', emotion: 'Delighted & Modern', role: 'Let the product shine visually' },
      { title: 'Core Feature Deep-Dive', type: 'content', layout: 'tech-diagram', copyFormula: 'Under-the-hood specs + features', emotion: 'Intellectual & Precision-focused', role: 'Detail specifications and capabilities' },
      { title: 'Customer Love', type: 'quote', layout: 'testimonial-quote', copyFormula: 'Early Beta User Endorsements', emotion: 'Joyful & Authentic', role: 'Social proof from actual users' },
      { title: 'Availability & Pricing', type: 'data', layout: 'ask-pie', copyFormula: 'Launch Offer + Channels', emotion: 'Excited & Exclusive', role: 'Give a clear call-to-action to purchase' }
    ]
  },
  {
    id: 'prob-sol-ben',
    name: 'Problem-Solution-Benefit',
    description: 'The standard classic framework. Perfect for general business introductions, networking events, or standard pitch decks.',
    slides: [
      { title: 'Business Profile', type: 'cover', layout: 'minimal-centered', copyFormula: 'Name + Value Statement', emotion: 'Polished & Professional', role: 'Introduce the brand' },
      { title: 'The Problem Statement', type: 'content', layout: 'problem-split', copyFormula: 'What is broken in the market', emotion: 'Empathetic & Urgent', role: 'Describe market friction' },
      { title: 'Our Elegant Solution', type: 'content', layout: 'solution-grid', copyFormula: 'What we offer to fix it', emotion: 'Resolving & Competent', role: 'Explain your business answer' },
      { title: 'Direct Benefits to Users', type: 'data', layout: 'impact-bento', copyFormula: 'Time, money, or stress saved', emotion: 'Encouraging & Promising', role: 'Focus strictly on client outcomes' },
      { title: 'Why Choose Us?', type: 'content', layout: 'compliance-list', copyFormula: 'Our Unique Competitive Edge', emotion: 'Peerless & Objective', role: 'Establish comparative advantage' },
      { title: 'Get in Touch', type: 'content', layout: 'minimal-centered', copyFormula: 'Contact Details + Next Steps', emotion: 'Welcoming & Frictionless', role: 'Prompt connection' }
    ]
  },
  {
    id: 'case-study',
    name: 'Case Study & Proof',
    description: 'A metric-dense pitch focusing heavily on real-world results, a specific client narrative, and proof of concept.',
    slides: [
      { title: 'The Business Impact Case', type: 'cover', layout: 'heroic-split', copyFormula: 'Client Case Study Name + Core Success', emotion: 'Grounded & Proven', role: 'Introduce the proof-of-concept case' },
      { title: 'The Challenge Faced', type: 'content', layout: 'problem-split', copyFormula: 'Client Pre-intervention Metrics', emotion: 'Empathetic & Serious', role: 'Frame the business difficulty' },
      { title: 'Our Method & Solution', type: 'content', layout: 'solution-grid', copyFormula: 'Custom Action Plan and Execution', emotion: 'Structured & Competent', role: 'Detail how you deployed your solution' },
      { title: 'The Stunning Metrics', type: 'data', layout: 'hockey-stick', copyFormula: 'Pre vs Post Intervention stats', emotion: 'Analytical & Triumph-driven', role: 'Show undeniable statistical proof of growth' },
      { title: 'Client Testimonial', type: 'quote', layout: 'testimonial-quote', copyFormula: 'Direct executive quote on results', emotion: 'Warm & Credible', role: 'Establish personal human trust' },
      { title: 'Replicate these Results', type: 'content', layout: 'compliance-list', copyFormula: 'Consultation booking instructions', emotion: 'Action-oriented', role: 'Call to action for new clients' }
    ]
  },
  {
    id: 'series-a',
    name: 'Series A Growth Pitch',
    description: 'Designed for post-revenue startups ready to scale operations, expand markets, and accelerate hiring with venture capital.',
    slides: [
      { title: 'Series A Growth Pitch', type: 'cover', layout: 'heroic-split', copyFormula: 'Company name + scale goal', emotion: 'Massive & Audacious', role: 'Declare the growth intent' },
      { title: 'Our Scaling Engine', type: 'content', layout: 'problem-split', copyFormula: 'Traction to date + product-market fit', emotion: 'Proud & Highly Profitable', role: 'Summarize current operational victory' },
      { title: 'Market Saturation Goal', type: 'data', layout: 'market-funnel', copyFormula: 'Unexplored territory vs captured market', emotion: 'Ambitious & Strategic', role: 'Outline the market expansion plan' },
      { title: 'The Expansion Model', type: 'content', layout: 'business-flow', copyFormula: 'New Unit Economics + LTV/CAC', emotion: 'Grounded & Math-heavy', role: 'Explain the scalability of the model' },
      { title: 'Series A Funding Ask', type: 'data', layout: 'ask-pie', copyFormula: 'ZAR Size of Round + Milestones', emotion: 'Commanding & Transparent', role: 'State the investment parameters' },
      { title: 'Operational Roadmap', type: 'data', layout: 'milestone-line', copyFormula: 'Next 18 Months of Milestones', emotion: 'Highly structured', role: 'Show a detailed plan for the next level' }
    ]
  }
];

export const LAYOUTS: Record<SlideLayout, { name: string }> = {
  'heroic-split': { name: 'Heroic Split Screen' },
  'minimal-centered': { name: 'Minimal Centered' },
  'problem-split': { name: 'Problem Split Layout' },
  'solution-grid': { name: 'Solution Multi-Grid' },
  'impact-bento': { name: 'Impact Bento Grid' },
  'market-funnel': { name: 'Market TAM-SAM-SOM Funnel' },
  'business-flow': { name: 'Business Flow Diagram' },
  'ask-pie': { name: 'Funding Use-of-Funds Pie' },
  'financial-chart': { name: 'Financial Projections Chart' },
  'compliance-list': { name: 'Compliance Checklist' },
  'hockey-stick': { name: 'Hockey-Stick Growth Graph' },
  'market-shift': { name: 'Market Tailwinds Shift' },
  'team-grid': { name: 'Team Profile Grid' },
  'tech-diagram': { name: 'Tech Stack Diagram' },
  'matrix-chart': { name: 'Comparison Matrix' },
  'milestone-line': { name: 'Timeline Milestones' },
  'testimonial-quote': { name: 'Testimonial Quote' }
};

export const LAYOUT_TEMPLATES = Object.entries(LAYOUTS).map(([id, val]) => ({ id, name: val.name }));

export const COPY_FORMULAS: Record<CopyFormula, { name: string; template: string }> = {
  'Problem-Agitate-Solve (PAS)': { name: 'Problem-Agitate-Solve (PAS)', template: 'Identify a pain point, agitate it, and present your solution.' },
  'Hook-Line-Sinker': { name: 'Hook-Line-Sinker', template: 'Grab attention with a bold hook, explain the core, and deliver the final CTA.' },
  'Vision + South African Context': { name: 'Vision + South African Context', template: 'Introduce your company mission placed in the South African development landscape.' },
  'TAM-SAM-SOM in ZAR': { name: 'TAM-SAM-SOM in ZAR', template: 'Break down Total Addressable, Serviceable Addressable, and Serviceable Obtainable markets in Rand.' },
  'Requested ZAR + Breakdown': { name: 'Requested ZAR + Breakdown', template: 'Specify total ZAR funding needed and high-level allocation pie chart.' },
  'BEE Status + Job Metrics': { name: 'BEE Status + Job Metrics', template: 'Demonstrate BEE score level and direct/indirect job creation forecast.' },
  'Founders + Pedigree + Skills': { name: 'Founders + Pedigree + Skills', template: 'Introduce team members, relevant backgrounds, and core capabilities.' },
  'Current Traction + Milestones': { name: 'Current Traction + Milestones', template: 'Highlight key achievements to date and immediate future milestones.' },
  'Before-After-Bridge (BAB)': { name: 'Before-After-Bridge (BAB)', template: 'Show the client before, the desired after, and how you bridge the gap.' },
  'High-Concept-Pitch (X for Y)': { name: 'High-Concept-Pitch (X for Y)', template: 'Instant high-concept analogy for rapid investor understanding.' },
  'Industry Shift + Opportunity': { name: 'Industry Shift + Opportunity', template: 'Detail a secular shift or regulatory tailwind opening a massive window.' },
  'Features to Benefits Mapping': { name: 'Features to Benefits Mapping', template: 'Direct connection from product functionality to end-user benefit.' },
  'Cost-Benefit Analysis': { name: 'Cost-Benefit Analysis', template: 'Show direct financial comparison of investment vs return.' },
  'Three Pillars of Growth': { name: 'Three Pillars of Growth', template: 'Explain the three core strategic thrusts driving company expansion.' },
  'The Golden Circle (Why-How-What)': { name: 'The Golden Circle (Why-How-What)', template: 'Start with why you do it, how you do it, and finally what you do.' },
  'Interactive Case Narrative': { name: 'Interactive Case Narrative', template: 'Take the audience through a real customer journey or operational case.' },
  'Unit Economics breakdown': { name: 'Unit Economics breakdown', template: 'Examine product-level pricing, cost of goods sold, and contribution margins.' },
  'ROI Guarantee / Statement': { name: 'ROI Guarantee / Statement', template: 'Deliver a clear, bulletproof ROI expectation for clients or investors.' },
  'Next-step Call-to-action': { name: 'Next-step Call-to-action', template: 'Provide clear, low-friction immediate next steps or contact info.' }
};

export const newOutlineSlideId = () => `slide_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createBlankOutlineSlide = (): SlideOutline => ({
  id: newOutlineSlideId(),
  title: 'New Slide',
  type: 'content',
  layout: 'heroic-split',
  copyFormula: 'Problem-Agitate-Solve (PAS)',
  emotion: 'confidence',
  role: 'hook',
  points: ['Enter a bullet point here'],
  visualPrompt: 'Clean minimalist vector graphic representing the concept',
  guidance: 'Define the core idea of this slide.'
});

export const STRATEGIES = PITCH_STRATEGIES;
export const getDefaultStrategy = () => PITCH_STRATEGIES[0];
export const getStrategyById = (id: string) => PITCH_STRATEGIES.find(s => s.id === id);


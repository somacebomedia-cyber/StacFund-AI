// services/proposal/proposalTemplates.ts
/**
 * StacFund — Premium proposal template registry
 * ==============================================
 * A small, curated set of "preloaded premium templates" — the Canva mental
 * model: the user never starts from blank, they pick a look and every page
 * instantly looks designed.
 *
 * All fonts are already loaded via Google Fonts <link> tags in index.html
 * (Inter, Lato, Cormorant Garamond, Unbounded) — no new font downloads, and
 * utils/pdfExporter's document.fonts.ready wait covers them at export time.
 *
 * A template is pure data (design tokens + a few style flags). The renderer
 * (components/proposal/ProposalPages.tsx) is shared — one renderer, three
 * looks — so adding a fourth template is a data-only change.
 */

export type TemplateStyle = 'editorial' | 'corporate' | 'minimal';

export interface ProposalTemplatePalette {
  /** Body page background. */
  page: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  inkSoft: string;
  /** Brand accent (user-overridable via accent swatches). */
  accent: string;
  /** Page border / hairline color. */
  border: string;
  /** Cover page background. */
  coverBg: string;
  /** Cover page text. */
  coverInk: string;
  /** Table header background on body pages. */
  tableHead: string;
  /** Table header text. */
  tableHeadInk: string;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  /** One-liner shown on the gallery card. */
  description: string;
  /** The vibe label, e.g. "Warm editorial". */
  vibe: string;
  style: TemplateStyle;
  fonts: { display: string; body: string };
  palette: ProposalTemplatePalette;
  /** Accent swatch choices shown in the gallery + editor top bar. */
  accentChoices: string[];
  /** Section-number rendering style. */
  numberStyle: 'serif-figure' | 'boxed' | 'plain';
}

// ─── The templates ───────────────────────────────────────────────────────────

/**
 * PROTEA — warm editorial. Named for South Africa's national flower.
 * Cream paper, Cormorant Garamond display serif, terracotta accent.
 * Reads like a premium magazine proposal.
 */
const protea: ProposalTemplate = {
  id: 'protea',
  name: 'Protea',
  description: 'Warm editorial serif on cream — premium magazine feel.',
  vibe: 'Warm editorial',
  style: 'editorial',
  fonts: { display: "'Cormorant Garamond', Georgia, serif", body: "'Inter', sans-serif" },
  palette: {
    page: '#FAF7F2',
    ink: '#2B2118',
    inkSoft: '#7A6A58',
    accent: '#C65D3B',
    border: '#E5DCCC',
    coverBg: '#F3EDE2',
    coverInk: '#2B2118',
    tableHead: '#F0E7D8',
    tableHeadInk: '#2B2118',
  },
  accentChoices: ['#C65D3B', '#8C5A3C', '#3F6B54', '#1F4E5F', '#7A3B5E'],
  numberStyle: 'serif-figure',
};

/**
 * BAOBAB — classic corporate. Deep navy + gold, Unbounded display headers.
 * The "bank-ready" look for SEFA / IDC / bank loan committees.
 */
const baobab: ProposalTemplate = {
  id: 'baobab',
  name: 'Baobab',
  description: 'Deep navy and gold — formal, bank-committee ready.',
  vibe: 'Classic corporate',
  style: 'corporate',
  fonts: { display: "'Unbounded', 'Lato', sans-serif", body: "'Lato', sans-serif" },
  palette: {
    page: '#FFFFFF',
    ink: '#14213D',
    inkSoft: '#5B6478',
    accent: '#D4A853',
    border: '#D9DEE8',
    coverBg: '#14213D',
    coverInk: '#F6F1E3',
    tableHead: '#14213D',
    tableHeadInk: '#F6F1E3',
  },
  accentChoices: ['#D4A853', '#B98A2F', '#1D3A6E', '#0F766E', '#8C2F39'],
  numberStyle: 'boxed',
};

/**
 * UMZANSI — minimal modern. White space, Inter, emerald accent, hairlines.
 * "Umzansi" — the south / grounded. Clean tech-startup energy.
 */
const umzansi: ProposalTemplate = {
  id: 'umzansi',
  name: 'Umzansi',
  description: 'Minimal, modern, generous white space — startup clean.',
  vibe: 'Minimal modern',
  style: 'minimal',
  fonts: { display: "'Inter', sans-serif", body: "'Inter', sans-serif" },
  palette: {
    page: '#FFFFFF',
    ink: '#111827',
    inkSoft: '#6B7280',
    accent: '#0F766E',
    border: '#E5E7EB',
    coverBg: '#FFFFFF',
    coverInk: '#111827',
    tableHead: '#F0FDFA',
    tableHeadInk: '#0F766E',
  },
  accentChoices: ['#0F766E', '#1D4ED8', '#B45309', '#BE185D', '#374151'],
  numberStyle: 'plain',
};

export const PROPOSAL_TEMPLATES: ProposalTemplate[] = [protea, baobab, umzansi];

export function getProposalTemplate(id: string): ProposalTemplate {
  return PROPOSAL_TEMPLATES.find((t) => t.id === id) || protea;
}

/** The effective accent for a document (override or template default). */
export function resolveAccent(template: ProposalTemplate, override?: string): string {
  return override && /^#[0-9a-fA-F]{6}$/.test(override) ? override : template.palette.accent;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Accent with alpha — used for tinted chips, soft fills and stat cards. */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * For dark covers (Baobab), text must stay light regardless of which accent
 * the user picks. This picks a readable ink for a given background luminance.
 */
export function readableInkOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#14213D' : '#FFFFFF';
}

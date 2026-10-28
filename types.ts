
export enum FundingType {
  GRANT = 'GRANT',
  EQUITY = 'EQUITY',
  LOAN = 'LOAN',
  HYBRID = 'HYBRID',
  COMPETITION = 'COMPETITION'
}

export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface RoadmapStep {
  id: string;
  label: string;
  isCompleted: boolean;
  description: string;
}

export type OpportunitySourceType = 'poster' | 'pdf' | 'text' | 'scraper' | 'manual';
export type ApplicationChannel = 'ONLINE' | 'IN_PERSON' | 'EMAIL' | 'POST' | 'MIXED';

export interface FundingThreshold {
  name: string;
  amount_min: number | null;
  amount_max: number | null;
  min_jobs: number | null;
  requirements: string[];
}

export interface EligibilityRules {
  age_min: number | null;
  age_max: number | null;
  youth_ownership_min_pct: number | null;
  sectors_excluded: string[];
}

export interface FundingOpportunityDb {
  opportunity_id: string;
  programme_name: string;
  issuer_name: string;
  issuer_type: string;
  logo_url?: string;
  official_status: boolean;
  status: 'OPEN' | 'CLOSED' | 'UPCOMING';
  funding_type: FundingType | string;
  target_stage: string;
  legal_form_required: string[];
  sector_tags: string[];
  geo_scope: string;
  amount_min: number;
  amount_max: number;
  non_cash_support: string;
  eligibility_summary: string;
  required_documents: string[];
  application_url: string;
  pdf_form_url?: string;
  source_url: string;
  closing_date: string;
  frequency: string;
  expected_open_month?: string;
  typical_duration_days?: number;
  preparation_checklist?: string[];
  common_rejection_reasons?: string[];
  contact_email?: string;
  contact_phone?: string;
  last_verified_at: string;
  verification_notes?: string;
  confidence_score: number;
  // ── Added for the reviewed directory (all optional, so older records still type-check) ──
  review_status?: 'published';
  opening_date?: string;
  cycle_label?: string;
  how_to_apply?: string;
  application_channel?: ApplicationChannel;
  emailed_applications_accepted?: boolean;
  thresholds?: FundingThreshold[];
  eligibility_rules?: EligibilityRules;
  dedupe_key?: string;
  source_type?: OpportunitySourceType;
  published_at?: string;
  scraped_at?: string;
}

// ─── Intake & review queue (shared by the server and the admin screen) ─────────
export type DraftStatus = 'pending' | 'published' | 'rejected';

/** What the AI read from a poster / PDF / page. Every field is null/empty when the document did not state it. */
export interface ExtractedOpportunity {
  programme_name: string | null;
  issuer_name: string | null;
  issuer_type: string | null;
  funding_type: string | null;
  cycle_label: string | null;
  opening_date: string | null;
  closing_date: string | null;
  closing_date_text: string | null;
  is_rolling: boolean | null;
  geo_scope: string | null;
  sector_tags: string[];
  sectors_excluded: string[];
  age_min: number | null;
  age_max: number | null;
  youth_ownership_min_pct: number | null;
  amount_min: number | null;
  amount_max: number | null;
  thresholds: FundingThreshold[];
  eligibility_summary: string | null;
  required_documents: string[];
  how_to_apply: string | null;
  application_channel: ApplicationChannel | null;
  emailed_applications_accepted: boolean | null;
  application_url: string | null;
  form_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  evidence: string[];
  risk_flags: string[];
  extraction_notes: string[];
}

export interface DraftRecord {
  review_status: DraftStatus;
  dedupe_key: string;
  source_type: OpportunitySourceType;
  source_name: string | null;
  source_url: string | null;
  submitted_by: string;
  created_at: string;
  updated_at: string;
  extracted: ExtractedOpportunity;
  possible_duplicate_of: string | null;
  change_note: string | null;
  published_id: string | null;
  published_at: string | null;
  reviewed_by: string | null;
  rejected_reason: string | null;
}

export interface DraftWithId extends DraftRecord {
  id: string;
}

export interface UserBusinessProfile {
  user_id: string;
  business_status: string;
  entity_type: string;
  industry: string;
  location: string;
  revenue_band: string;
  staff_count: number;
  has_bank_account: boolean;
  has_sars_tax: boolean;
  has_cipc_registration: boolean;
  age: number;
  documents_ready: string[];
}

export interface FundingOpportunity {
  id: string;
  title: string;
  provider: string;
  logoUrl?: string;
  type: FundingType;
  description: string;
  range: string;
  deadline: string;
  tags: string[];
  isNew?: boolean;
}

export interface Application {
  id: string;
  userId: string;
  opportunityId: string;
  opportunityTitle: string;
  provider: string;
  logoUrl?: string;
  status: ApplicationStatus;
  date: string;
  type: FundingType;
  submissionMethod?: string;
  deadline?: string;
}

export interface AppDocument {
  id: string;
  userId: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  category: string;
  content?: string;
  hasChunks?: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  icon: string;
}

export interface User {
  id: string;
  email: string;
  businessName: string;
  whatsapp?: string;
  isVerified: boolean;
  password?: string;
  logoUrl?: string;
  subscriptionPlan: 'free' | 'pro' | 'business';
  billingCycle?: 'monthly' | 'yearly';
  onboardingComplete?: boolean;
  signupNumber?: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  date: string;
  type?: 'info' | 'success' | 'warning' | 'alert';
  actionPage?: string;
  opportunityId?: string;
  cutoffDate?: string;
}

export interface ReadinessInfo {
  score: number;
  tips: string[];
}

export interface FundingDeadlineItem {
  id: string;
  opportunityId: string;
  title: string;
  provider: string;
  logoUrl?: string;
  type: FundingType | string;
  amountText: string;
  cutoffDate: string; // ISO string or parsable date
  urgency: 'critical' | 'imminent' | 'upcoming' | 'passed';
  hoursRemaining: number;
  totalSecondsRemaining: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isApplication?: boolean;
  applicationId?: string;
  applicationStatus?: ApplicationStatus;
  requiredDocs?: string[];
  eligibilitySummary?: string;
  applicationUrl?: string;
}


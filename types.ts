
export enum FundingType {
  GRANT = 'GRANT',
  EQUITY = 'EQUITY',
  LOAN = 'LOAN',
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

export interface FundingOpportunityDb {
  opportunity_id: string;
  programme_name: string;
  issuer_name: string;
  issuer_type: string;
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
  source_url: string;
  closing_date: string;
  frequency: string;
  expected_open_month?: string;
  typical_duration_days?: number;
  preparation_checklist?: string[];
  common_rejection_reasons?: string[];
  contact_email: string;
  contact_phone: string;
  last_verified_at: string;
  verification_notes: string;
  confidence_score: number;
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
  status: ApplicationStatus;
  date: string;
  type: FundingType;
  submissionMethod?: string;
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
}

export interface ReadinessInfo {
  score: number;
  tips: string[];
}

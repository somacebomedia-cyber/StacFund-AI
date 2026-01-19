
export enum FundingType {
  GRANT = 'GRANT',
  EQUITY = 'EQUITY',
  LOAN = 'LOAN',
  COMPETITION = 'COMPETITION'
}

export enum ApplicationStatus {
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
}

export interface AppDocument {
  id: string;
  userId: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  category: string;
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
  subscriptionPlan: 'free' | 'pro' | 'business';
  billingCycle?: 'monthly' | 'yearly';
}

export interface ReadinessInfo {
  score: number;
  tips: string[];
}

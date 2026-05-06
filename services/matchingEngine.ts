import { FundingOpportunityDb, UserBusinessProfile } from '../types';

export interface MatchScore {
  opportunityId: string;
  totalScore: number;
  eligibilityScore: number; // Max 40
  readinessScore: number;   // Max 30
  speedScore: number;       // Max 15
  valueFitScore: number;    // Max 15
  matchReason: string;
}

export function calculateMatch(
  profile: UserBusinessProfile,
  opportunity: FundingOpportunityDb
): MatchScore {
  let eligibilityScore = 0;
  let readinessScore = 0;
  let speedScore = 0;
  let valueFitScore = 0;

  // 1. Eligibility (Max 40)
  const isAnySector = opportunity.sector_tags.length === 0 || opportunity.sector_tags.includes('All') || opportunity.sector_tags.includes('Any');
  if (isAnySector || opportunity.sector_tags.includes(profile.industry)) {
    eligibilityScore += 20;
  }

  const isAnyScope = !opportunity.geo_scope || opportunity.geo_scope === 'National' || opportunity.geo_scope === 'Global';
  if (isAnyScope || opportunity.geo_scope === profile.location) {
    eligibilityScore += 10;
  }

  const isAnyLegal = opportunity.legal_form_required.length === 0 || opportunity.legal_form_required.includes('Any');
  if (isAnyLegal || opportunity.legal_form_required.includes(profile.entity_type)) {
    eligibilityScore += 10;
  }

  // 2. Readiness (Max 30)
  const reqDocsCount = opportunity.required_documents.length;
  if (reqDocsCount > 0) {
    const matchedDocs = opportunity.required_documents.filter(doc => profile.documents_ready.includes(doc)).length;
    readinessScore += (matchedDocs / reqDocsCount) * 15;
  } else {
    readinessScore += 15;
  }
  
  if (profile.has_bank_account) readinessScore += 5;
  if (profile.has_sars_tax) readinessScore += 5;
  if (profile.has_cipc_registration) readinessScore += 5;

  // 3. Speed (Max 15)
  // Higher score for rolling frequency or highly active issuers
  if (opportunity.frequency?.toLowerCase().includes('rolling') || opportunity.frequency?.toLowerCase().includes('always open')) {
    speedScore += 15;
  } else {
    speedScore += 7; // Average speed
  }

  // 4. Value Fit (Max 15)
  // Non-cash support is a bonus for value fit
  if (opportunity.non_cash_support && opportunity.non_cash_support !== 'None') {
    valueFitScore += 10;
  } else {
    valueFitScore += 5;
  }

  if (profile.revenue_band !== 'Pre-revenue' && opportunity.amount_max > 50000) {
    valueFitScore += 5;
  }

  const totalScore = Math.min(100, Math.round(eligibilityScore + readinessScore + speedScore + valueFitScore));

  let matchReason = `Strong match for your industry (${profile.industry || 'Unknown'}).`;
  if (readinessScore > 20) {
    matchReason += " Your business is highly prepared for this application.";
  } else if (readinessScore < 10) {
    matchReason += " You need to gather more documents to improve your chances.";
  }

  return {
    opportunityId: opportunity.opportunity_id,
    totalScore,
    eligibilityScore,
    readinessScore,
    speedScore,
    valueFitScore,
    matchReason
  };
}

export function getMatchMeOpportunities(
  profile: UserBusinessProfile,
  opportunities: FundingOpportunityDb[]
): { item: FundingOpportunityDb; score: number; reason: string }[] {
  return opportunities
    .map(opp => {
      const match = calculateMatch(profile, opp);
      return { item: opp, score: match.totalScore, reason: match.matchReason };
    })
    .sort((a, b) => b.score - a.score);
}

export function getApplyReadyOpportunities(
  profile: UserBusinessProfile,
  opportunities: FundingOpportunityDb[]
): { item: FundingOpportunityDb; score: number; reason: string }[] {
  return opportunities
    .map(opp => {
      const match = calculateMatch(profile, opp);
      return { item: opp, score: match.totalScore, reason: match.matchReason, readinessScore: match.readinessScore };
    })
    .filter(wrapped => wrapped.readinessScore >= 20) // Only highly ready
    .sort((a, b) => b.readinessScore - a.readinessScore);
}

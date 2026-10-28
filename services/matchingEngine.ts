import { FundingOpportunityDb, UserBusinessProfile } from '../types';
import { evaluateEligibility, type EligibilityResult } from './eligibilityEngine';

export interface MatchScore {
  opportunityId: string;
  totalScore: number;
  eligibilityScore: number; // Max 40
  readinessScore: number;   // Max 30
  speedScore: number;       // Max 15
  valueFitScore: number;    // Max 15
  matchReason: string;
  /** Hard-rule eligibility result. `eligible: false` means do not recommend. */
  hardRules: EligibilityResult;
}

export function calculateMatch(
  profile: UserBusinessProfile,
  opportunity: FundingOpportunityDb
): MatchScore {
  let eligibilityScore = 0;
  let readinessScore = 0;
  let speedScore = 0;
  let valueFitScore = 0;

  // 1. Soft eligibility (the historical 0-100 score, kept for ranking among eligible opps)
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
  if (opportunity.frequency?.toLowerCase().includes('rolling') || opportunity.frequency?.toLowerCase().includes('always open')) {
    speedScore += 15;
  } else {
    speedScore += 7;
  }

  // 4. Value Fit (Max 15)
  if (opportunity.non_cash_support && opportunity.non_cash_support !== 'None') {
    valueFitScore += 10;
  } else {
    valueFitScore += 5;
  }

  if (profile.revenue_band !== 'Pre-revenue' && opportunity.amount_max > 50000) {
    valueFitScore += 5;
  }

  const totalScore = Math.min(100, Math.round(eligibilityScore + readinessScore + speedScore + valueFitScore));

  // 4. Hard rules — pass/fail with reasons. This is what was missing before:
  // the engine used to add up a 0-100 score and never excluded anyone.
  const hardRules = evaluateEligibility(profile, opportunity);

  // Compose the human-facing reason. Lead with the blocking reasons (if any),
  // then the unknowns, then the soft-score explanation. This means the user
  // sees the disqualifier first, not the score.
  let matchReason = '';
  if (!hardRules.eligible) {
    matchReason = hardRules.blockingReasons.join(' ');
  } else if (hardRules.hasUnknowns) {
    matchReason = 'Eligible, but we need more profile data: ' + hardRules.missingDataReasons.join(' ');
  } else if (readinessScore > 20) {
    matchReason = `Strong match for your industry (${profile.industry || 'unknown'}). Your business is highly prepared for this application.`;
  } else if (readinessScore < 10) {
    matchReason = `Eligible, but you need to gather more documents to improve your chances.`;
  } else {
    matchReason = `Eligible for your industry (${profile.industry || 'unknown'}).`;
  }

  return {
    opportunityId: opportunity.opportunity_id,
    totalScore,
    eligibilityScore,
    readinessScore,
    speedScore,
    valueFitScore,
    matchReason,
    hardRules,
  };
}

/**
 * Returns opportunities the user is hard-rule-eligible for, ranked by the soft
 * score. Hard-rule fails are excluded entirely; unknowns are kept (with a note)
 * because the user might still be eligible — they just need to fill in more
 * profile data.
 */
export function getMatchMeOpportunities(
  profile: UserBusinessProfile,
  opportunities: FundingOpportunityDb[]
): { item: FundingOpportunityDb; score: number; reason: string; hardRules: EligibilityResult }[] {
  return opportunities
    .map(opp => {
      const match = calculateMatch(profile, opp);
      return { item: opp, score: match.totalScore, reason: match.matchReason, hardRules: match.hardRules };
    })
    .filter(wrapped => wrapped.hardRules.eligible) // Drop hard-rule fails
    .sort((a, b) => b.score - a.score);
}

/**
 * Returns opportunities the user is hard-rule-eligible for AND has high
 * readiness for. "Apply Ready" means the documents on file cover most of
 * what the funder asks for, so the user could submit today.
 */
export function getApplyReadyOpportunities(
  profile: UserBusinessProfile,
  opportunities: FundingOpportunityDb[]
): { item: FundingOpportunityDb; score: number; reason: string; readinessScore: number; hardRules: EligibilityResult }[] {
  return opportunities
    .map(opp => {
      const match = calculateMatch(profile, opp);
      return {
        item: opp,
        score: match.totalScore,
        reason: match.matchReason,
        readinessScore: match.readinessScore,
        hardRules: match.hardRules,
      };
    })
    .filter(wrapped => wrapped.hardRules.eligible && wrapped.readinessScore >= 20)
    .sort((a, b) => b.readinessScore - a.readinessScore);
}

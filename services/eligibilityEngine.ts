// services/eligibilityEngine.ts
/**
 * StacFund — Hard-rule eligibility engine
 * =====================================
 * Returns a pass/fail verdict per opportunity with a human-readable reason
 * for every failed rule. Used by the Funding Explorer (Match Me / Apply Ready
 * modes) and the autofill layer (so the form knows which fields to disable).
 *
 * Design rules:
 *  - "Pass" only when an opportunity's hard rule has data AND the profile
 *    satisfies it.
 *  - "Unknown" when either side lacks the data needed to evaluate the rule.
 *    Unknown never fails an application — the user simply sees a warning so
 *    they know to fill in the missing profile field.
 *  - "Fail" only when both sides have data and they contradict.
 *  - Reason text is shown to the user verbatim; never throw.
 *
 * This file is browser-only. The server-side intake screen does not need it
 * (the admin is the human in the loop there).
 */
import type { FundingOpportunityDb, EligibilityRules, UserBusinessProfile } from '../types';

export type Verdict = 'pass' | 'fail' | 'unknown';

export interface RuleResult {
  /** Stable id so the UI can key on it. */
  id: string;
  /** Short label e.g. "Age", "Excluded sectors". */
  label: string;
  verdict: Verdict;
  /** Plain-English explanation, shown to the user. */
  reason: string;
}

export interface EligibilityResult {
  /** True only when no rule failed. `unknown` rules do NOT fail. */
  eligible: boolean;
  /** True if at least one rule is `unknown` — applicant should fill in more profile data. */
  hasUnknowns: boolean;
  rules: RuleResult[];
  /** Convenience: only the failing rules' reasons. */
  blockingReasons: string[];
  /** Convenience: only the unknown rules' reasons. */
  missingDataReasons: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOUTH_AFRICAN_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const;

function normaliseProvince(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (!t || t === 'national' || t === 'any' || t === 'all' || t === 'global') return null;
  // Match "KZN", "kzn", "kwazulu natal", "KwaZulu-Natal" all to the canonical form.
  const aliases: Record<string, string> = {
    kzn: 'KwaZulu-Natal',
    'kwazulu natal': 'KwaZulu-Natal',
    'kwazulu-natal': 'KwaZulu-Natal',
    ec: 'Eastern Cape',
    'eastern cape': 'Eastern Cape',
    fs: 'Free State',
    'free state': 'Free State',
    gp: 'Gauteng',
    gauteng: 'Gauteng',
    lp: 'Limpopo',
    limpopo: 'Limpopo',
    mp: 'Mpumalanga',
    mpumalanga: 'Mpumalanga',
    nw: 'North West',
    'north west': 'North West',
    nc: 'Northern Cape',
    'northern cape': 'Northern Cape',
    wc: 'Western Cape',
    'western cape': 'Western Cape',
  };
  if (aliases[t]) return aliases[t];
  const found = SOUTH_AFRICAN_PROVINCES.find((p) => p.toLowerCase() === t);
  return found ?? s.trim();
}

function sectorMatches(profileIndustry: string, excluded: string): boolean {
  const a = (profileIndustry || '').trim().toLowerCase();
  const b = (excluded || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // Substring both ways: "Construction & Engineering" vs "Construction"
  if (a.includes(b) || b.includes(a)) return true;
  // Token overlap, so "Minibus taxi operator" matches "Minibus, coach or app
  // taxis" (the official exclusion wording) even though neither contains the
  // other. Short glue words are ignored so "and"/"services" never match alone.
  const stop = new Set(['and', 'or', 'the', 'of', 'for', 'with', 'a', 'an', 'in', 'as', 'to', 'any', 'other', 'related', 'business', 'businesses', 'sales', 'standalone', 'services', 'activities', 'forms', 'form']);
  const tokens = (s: string): string[] => s.split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !stop.has(t));
  const tb = tokens(b);
  return tokens(a).some((t) => tb.includes(t));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate the four hard rules described in the patch README:
 *   1. Age (min/max)
 *   2. Province (geo_scope vs profile.location)
 *   3. Legal form (entity_type vs legal_form_required)
 *   4. Excluded sectors (profile.industry vs eligibility_rules.sectors_excluded)
 *
 * Bonus rules that fire only when the profile actually has the data:
 *   5. Youth ownership % (eligibility_rules.youth_ownership_min_pct)
 *   6. Sector allowlist (when opportunity.sector_tags is non-empty and not ['Any'])
 */
export function evaluateEligibility(
  profile: UserBusinessProfile,
  opp: FundingOpportunityDb
): EligibilityResult {
  const rules: RuleResult[] = [];
  const r: EligibilityRules = opp.eligibility_rules ?? { age_min: null, age_max: null, youth_ownership_min_pct: null, sectors_excluded: [] };

  // 1. Age
  if (r.age_min !== null || r.age_max !== null) {
    const age = Number(profile.age);
    if (!profile.age || age <= 0) {
      rules.push({
        id: 'age',
        label: 'Age',
        verdict: 'unknown',
        reason: `This opportunity has an age limit (${r.age_min ?? '–'} to ${r.age_max ?? '–'}). Add your age to your profile so we can check.`,
      });
    } else if (r.age_min !== null && age < r.age_min) {
      rules.push({
        id: 'age',
        label: 'Age',
        verdict: 'fail',
        reason: `You need to be at least ${r.age_min}. You are ${age}.`,
      });
    } else if (r.age_max !== null && age > r.age_max) {
      rules.push({
        id: 'age',
        label: 'Age',
        verdict: 'fail',
        reason: `You need to be ${r.age_max} or younger. You are ${age}.`,
      });
    } else {
      rules.push({
        id: 'age',
        label: 'Age',
        verdict: 'pass',
        reason: `You are ${age}, within the ${r.age_min ?? '–'}–${r.age_max ?? '–'} age limit.`,
      });
    }
  }

  // 2. Province
  if (opp.geo_scope && opp.geo_scope !== 'National' && opp.geo_scope !== 'Global' && opp.geo_scope !== 'Any') {
    const oppProv = normaliseProvince(opp.geo_scope);
    const profileProv = normaliseProvince(profile.location);
    if (!profileProv) {
      rules.push({
        id: 'province',
        label: 'Province',
        verdict: 'unknown',
        reason: `This funding is for ${oppProv}. Add your province to your profile so we can check.`,
      });
    } else if (profileProv !== oppProv) {
      rules.push({
        id: 'province',
        label: 'Province',
        verdict: 'fail',
        reason: `This funding is for ${oppProv}, but your profile says ${profileProv}.`,
      });
    } else {
      rules.push({
        id: 'province',
        label: 'Province',
        verdict: 'pass',
        reason: `You are in ${profileProv}, which matches this funding.`,
      });
    }
  }

  // 3. Legal form
  if (opp.legal_form_required.length > 0 && !opp.legal_form_required.includes('Any')) {
    // Profiles store either readable names ("Private Company", the ProfileForm
    // default) or codes ("PTY_LTD" from older synths) or "Not specified"
    // (OnboardingWizard). Codes map to the readable names records use;
    // "Not specified" stays unknown instead of hard-failing.
    const rawEntity = (profile.entity_type || '').trim();
    const entityAliases: Record<string, string> = {
      pty_ltd: 'Private Company',
      pty: 'Private Company',
      cc: 'Close Corporation',
      'close corp': 'Close Corporation',
      sole_proprietor: 'Sole Proprietor',
      sole_trader: 'Sole Proprietor',
      coop: 'Cooperative',
      cooperative: 'Cooperative',
      trust: 'Trust',
      partnership: 'Partnership',
    };
    const b = (entityAliases[rawEntity.toLowerCase()] ?? rawEntity).toLowerCase();
    const known = b !== '' && !/^(not specified|unknown|n\/a|none|other)$/.test(b);
    const hasForm = known && opp.legal_form_required.some((f) => {
      const a = f.trim().toLowerCase();
      return a && (a === b || a.includes(b) || b.includes(a));
    });
    if (!known) {
      rules.push({
        id: 'legal_form',
        label: 'Legal form',
        verdict: 'unknown',
        reason: `This funding needs one of: ${opp.legal_form_required.join(', ')}. Add your entity type to your profile.`,
      });
    } else if (!hasForm) {
      rules.push({
        id: 'legal_form',
        label: 'Legal form',
        verdict: 'fail',
        reason: `This funding needs one of: ${opp.legal_form_required.join(', ')}. Your profile says ${profile.entity_type}.`,
      });
    } else {
      rules.push({
        id: 'legal_form',
        label: 'Legal form',
        verdict: 'pass',
        reason: `Your ${profile.entity_type} is accepted.`,
      });
    }
  }

  // 4. Excluded sectors
  if (r.sectors_excluded.length > 0) {
    const hit = r.sectors_excluded.find((ex) => sectorMatches(profile.industry, ex));
    if (!profile.industry) {
      rules.push({
        id: 'excluded_sector',
        label: 'Excluded sectors',
        verdict: 'unknown',
        reason: `This funding excludes: ${r.sectors_excluded.join(', ')}. Add your industry to your profile so we can check.`,
      });
    } else if (hit) {
      rules.push({
        id: 'excluded_sector',
        label: 'Excluded sectors',
        verdict: 'fail',
        reason: `Your industry "${profile.industry}" is on this funder's exclusion list ("${hit}").`,
      });
    } else {
      rules.push({
        id: 'excluded_sector',
        label: 'Excluded sectors',
        verdict: 'pass',
        reason: `Your industry is not on this funder's exclusion list.`,
      });
    }
  }

  // 5. Sector allowlist
  if (opp.sector_tags.length > 0 && !opp.sector_tags.includes('Any') && !opp.sector_tags.includes('All')) {
    const hit = opp.sector_tags.find((s) => sectorMatches(profile.industry, s));
    if (!profile.industry) {
      rules.push({
        id: 'sector_allowlist',
        label: 'Eligible sectors',
        verdict: 'unknown',
        reason: `This funding targets: ${opp.sector_tags.join(', ')}. Add your industry to your profile so we can check.`,
      });
    } else if (!hit) {
      rules.push({
        id: 'sector_allowlist',
        label: 'Eligible sectors',
        verdict: 'fail',
        reason: `This funding targets ${opp.sector_tags.join(', ')}. Your industry is "${profile.industry}".`,
      });
    } else {
      rules.push({
        id: 'sector_allowlist',
        label: 'Eligible sectors',
        verdict: 'pass',
        reason: `Your industry matches one of the targeted sectors.`,
      });
    }
  }

  // 6. Youth ownership
  if (r.youth_ownership_min_pct !== null) {
    // The UserBusinessProfile type doesn't formally carry this field yet;
    // some profile forms capture it under one of these keys. Treat all as optional.
    const extended = profile as UserBusinessProfile & {
      youth_ownership_pct?: number | null;
      youth_ownership_min_pct?: number | null;
      youthOwnershipPct?: number | null;
    };
    const profilePct = extended.youth_ownership_pct ?? extended.youthOwnershipPct ?? extended.youth_ownership_min_pct;
    if (profilePct === null || profilePct === undefined) {
      rules.push({
        id: 'youth_ownership',
        label: 'Youth ownership',
        verdict: 'unknown',
        reason: `This opportunity requires at least ${r.youth_ownership_min_pct}% youth ownership. Add this to your profile so we can check.`,
      });
    } else if (profilePct < r.youth_ownership_min_pct) {
      rules.push({
        id: 'youth_ownership',
        label: 'Youth ownership',
        verdict: 'fail',
        reason: `This opportunity requires at least ${r.youth_ownership_min_pct}% youth ownership. You have ${profilePct}%.`,
      });
    } else {
      rules.push({
        id: 'youth_ownership',
        label: 'Youth ownership',
        verdict: 'pass',
        reason: `Your youth ownership of ${profilePct}% meets the ${r.youth_ownership_min_pct}% minimum.`,
      });
    }
  }

  const blockingReasons = rules.filter((x) => x.verdict === 'fail').map((x) => x.reason);
  const missingDataReasons = rules.filter((x) => x.verdict === 'unknown').map((x) => x.reason);
  return {
    eligible: blockingReasons.length === 0,
    hasUnknowns: missingDataReasons.length > 0,
    rules,
    blockingReasons,
    missingDataReasons,
  };
}

/** Convenience: just the verdict, for sorting. */
export function isEligible(profile: UserBusinessProfile, opp: FundingOpportunityDb): boolean {
  return evaluateEligibility(profile, opp).eligible;
}

// services/autofillContext.ts
/**
 * StacFund — Autofill context builder
 * ===================================
 * Pulls together the user's profile (from Firestore) and an opportunity's
 * stored rules / tiers / document list (the data the patch README put in
 * place) and turns them into a single structured context that the form
 * autofill and business-plan generators can paste into their AI prompts.
 *
 * Browser-safe. No secrets. No Firestore writes.
 *
 * Used by:
 *  - components/ApplicationWorkflow.tsx → handleAutoFill() + generateBusinessPlan()
 *  - components/FormDigitizer.tsx      → analyzeForm() (when an opportunity is selected)
 */
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { evaluateEligibility, type EligibilityResult } from './eligibilityEngine';
import type { FundingOpportunityDb, FundingThreshold, UserBusinessProfile } from '../types';

export interface AutofillContext {
  /** Plain-text summary suitable for an AI prompt. */
  promptBlock: string;
  /** The structured profile object, for direct field mapping. */
  profile: Partial<UserBusinessProfile> & Record<string, unknown>;
  /** The structured opportunity, for direct field mapping. */
  opportunity: FundingOpportunityDb;
  /** The opportunity's named funding tiers, in the order the funder lists them. */
  tiers: FundingThreshold[];
  /** The documents the funder asks for, normalised. */
  requiredDocuments: string[];
  /** Documents in the user's vault that match the funder's checklist. */
  matchedDocuments: string[];
  /** Documents the funder asks for that are NOT in the user's vault yet. */
  missingDocuments: string[];
  /** Eligibility verdict. The autofill UI surfaces this so the user can see why they may not qualify before filling out the form. */
  eligibility: EligibilityResult;
  /** When the user has typed a requested amount, this is the tier the AI should pick. */
  suggestedTier: FundingThreshold | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toLocaleString('en-ZA')}`;
}

function tierMatchesAmount(tier: FundingThreshold, amount: number): boolean {
  if (amount <= 0) return false;
  if (tier.amount_min !== null && amount < tier.amount_min) return false;
  if (tier.amount_max !== null && amount > tier.amount_max) return false;
  return true;
}

/**
 * Some funders store their required documents under slightly different
 * names than what's in the user's vault. This helper does a case-insensitive
 * substring match so "Tax Clearance Certificate" matches "Tax Clearance"
 * and "CIPC" matches "CIPC Registration".
 */
function docMatches(required: string, owned: string): boolean {
  const a = required.trim().toLowerCase();
  const b = owned.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // Strip "certificate", "registration", "document" and "form" — these are
  // usually interchangeable in funder wording.
  const strip = (s: string) => s.replace(/\b(certificate|registration|document|form|copy|certified)\b/g, '').replace(/[^a-z0-9]/g, '');
  return strip(a) === strip(b) || strip(a).includes(strip(b)) || strip(b).includes(strip(a));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the autofill context for one user + one opportunity.
 *
 * @param userId              Firebase uid
 * @param opportunity         The published opportunity record (already loaded)
 * @param fundingRequested    Optional: the amount the user typed into the form,
 *                             so we can pick the right tier
 */
export async function buildAutofillContext(
  userId: string,
  opportunity: FundingOpportunityDb,
  fundingRequested?: string | number
): Promise<AutofillContext> {
  // 1. Fetch the user's profile + owner info + their document vault.
  let profile: Record<string, unknown> = {};
  let ownerInfo: Record<string, unknown> = {};
  let ownedDocs: string[] = [];
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const data = userDoc.data();
      profile = data.profile ?? {};
      ownerInfo = data.ownerInfo ?? {};
    }
    const docsSnap = await getDocs(collection(db, 'users', userId, 'documents'));
    ownedDocs = docsSnap.docs
      .map((d) => ((d.data().name as string) || (d.data().type as string) || '').toString().trim())
      .filter(Boolean);
  } catch (e) {
    console.warn('[autofillContext] Could not read user profile / documents', e);
  }

  // 2. Synthesize a UserBusinessProfile from the raw profile data, the same
  //    way FundingExplorer does. We do NOT use the engine to gate anything —
  //    we just want the eligibility verdict as informational context.
  const ageNum = Number(ownerInfo.age);
  const userProfile: UserBusinessProfile = {
    user_id: userId,
    business_status: (profile.registered as string) === 'Yes' ? 'REGISTERED' : 'CONCEPT',
    entity_type: ((profile.type as string) || (profile.entity_type as string) || 'PTY_LTD'),
    industry: ((profile.sector as string) || (profile.industry as string) || '') as string,
    location: ((profile.province as string) || (profile.location as string) || 'National') as string,
    revenue_band: ((profile.revenue_band as string) || (profile.revenue as string) || 'PRE_REVENUE') as string,
    staff_count: Number(profile.employees || 1) || 1,
    has_bank_account: Boolean(profile.has_bank_account ?? true),
    has_sars_tax: Boolean(profile.has_sars_tax ?? true),
    has_cipc_registration: (profile.registered as string) === 'Yes' || Boolean(profile.has_cipc_registration),
    age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : 0,
    documents_ready: Array.isArray(profile.documents_ready) ? (profile.documents_ready as string[]) : ['CIPC', 'TAX_CLEARANCE', 'ID', 'BANK_STATEMENT'],
  };

  // 3. Run the eligibility engine so the autofill UI can surface the verdict
  //    before the user starts typing.
  const eligibility = evaluateEligibility(userProfile, opportunity);

  // 4. Match the user's documents against the funder's required list.
  const requiredDocuments = opportunity.required_documents ?? [];
  const matchedDocuments = requiredDocuments.filter((req) =>
    ownedDocs.some((owned) => docMatches(req, owned))
  );
  const missingDocuments = requiredDocuments.filter(
    (req) => !ownedDocs.some((owned) => docMatches(req, owned))
  );

  // 5. Pick the right funding tier (if any) based on the amount the user typed.
  const tiers = opportunity.thresholds ?? [];
  let suggestedTier: FundingThreshold | null = null;
  if (tiers.length > 0) {
    const amountNum = typeof fundingRequested === 'number' ? fundingRequested : Number(String(fundingRequested || '').replace(/[^\d.]/g, ''));
    if (Number.isFinite(amountNum) && amountNum > 0) {
      suggestedTier = tiers.find((t) => tierMatchesAmount(t, amountNum)) ?? null;
    }
    if (!suggestedTier) {
      // Default to the smallest tier if the user hasn't entered an amount yet.
      suggestedTier = tiers[0];
    }
  }

  // 6. Compose the prompt block — this is what gets pasted into AI prompts.
  const lines: string[] = [];
  lines.push('OPPORTUNITY:');
  lines.push(`- Issuer: ${opportunity.issuer_name || '—'}`);
  lines.push(`- Programme: ${opportunity.programme_name || '—'}`);
  lines.push(`- Funding type: ${opportunity.funding_type || '—'}`);
  lines.push(`- Geo scope: ${opportunity.geo_scope || 'National'}`);
  if (opportunity.eligibility_summary) lines.push(`- Eligibility summary: ${opportunity.eligibility_summary}`);
  if (opportunity.how_to_apply) lines.push(`- How to apply: ${opportunity.how_to_apply}`);
  if (opportunity.application_channel) lines.push(`- Application channel: ${opportunity.application_channel}`);
  if (opportunity.emailed_applications_accepted !== undefined) {
    lines.push(`- Emailed applications accepted: ${opportunity.emailed_applications_accepted ? 'Yes' : 'No'}`);
  }
  if (opportunity.contact_email) lines.push(`- Contact email: ${opportunity.contact_email}`);
  if (opportunity.contact_phone) lines.push(`- Contact phone: ${opportunity.contact_phone}`);
  if (opportunity.closing_date) lines.push(`- Closing date: ${opportunity.closing_date}`);
  if (opportunity.opening_date) lines.push(`- Opening date: ${opportunity.opening_date}`);

  // Eligibility rules
  const r = opportunity.eligibility_rules;
  if (r) {
    if (r.age_min !== null || r.age_max !== null) {
      lines.push(`- Age limit: ${r.age_min ?? '—'} to ${r.age_max ?? '—'}`);
    }
    if (r.youth_ownership_min_pct !== null) {
      lines.push(`- Minimum youth ownership: ${r.youth_ownership_min_pct}%`);
    }
    if (r.sectors_excluded.length > 0) {
      lines.push(`- Sectors excluded: ${r.sectors_excluded.join(', ')}`);
    }
  }

  // Funding tiers (the funder often has 2-3 named tiers with different
  // amount ranges and job-creation requirements).
  if (tiers.length > 0) {
    lines.push('FUNDING TIERS (pick the one that matches the requested amount):');
    for (const t of tiers) {
      const req = t.requirements.length ? ` — requirements: ${t.requirements.join('; ')}` : '';
      const jobs = t.min_jobs !== null ? ` — must create at least ${t.min_jobs} jobs` : '';
      lines.push(`- ${t.name}: ${fmtMoney(t.amount_min)}–${fmtMoney(t.amount_max)}${jobs}${req}`);
    }
    if (suggestedTier) {
      lines.push(`(If the applicant did not specify an amount, use the "${suggestedTier.name}" tier.)`);
    }
  }

  // Required documents (so the AI tells the user which docs to attach).
  if (requiredDocuments.length > 0) {
    lines.push(`REQUIRED DOCUMENTS: ${requiredDocuments.join('; ')}`);
    if (matchedDocuments.length > 0) lines.push(`(User already has: ${matchedDocuments.join('; ')})`);
    if (missingDocuments.length > 0) lines.push(`(User is MISSING: ${missingDocuments.join('; ')}) — flag these as "missing" in the form output.)`);
  }

  // Eligibility verdict — warn the AI before it suggests values that would
  // waste the user's time on a funder that will reject them.
  if (!eligibility.eligible) {
    lines.push(`ELIGIBILITY WARNING — this applicant does NOT meet the hard rules:`);
    eligibility.blockingReasons.forEach((reason) => lines.push(`- ${reason}`));
  } else if (eligibility.hasUnknowns) {
    lines.push(`ELIGIBILITY NOTE — some hard rules could not be checked because the profile is missing data:`);
    eligibility.missingDataReasons.forEach((reason) => lines.push(`- ${reason}`));
  }

  lines.push('');
  lines.push('USER PROFILE:');
  lines.push(`- Business name: ${profile.name || '—'}`);
  lines.push(`- Registration number: ${profile.registration || '—'}`);
  lines.push(`- Industry: ${userProfile.industry || '—'}`);
  lines.push(`- Province: ${userProfile.location || '—'}`);
  lines.push(`- Entity type: ${userProfile.entity_type || '—'}`);
  lines.push(`- Owner name: ${ownerInfo.name || '—'}`);
  if (userProfile.age > 0) lines.push(`- Owner age: ${userProfile.age}`);
  if (ownerInfo.idNumber) lines.push(`- Owner ID: ${ownerInfo.idNumber}`);
  lines.push(`- Contact email: ${profile.email || '—'}`);
  if (profile.whatsapp) lines.push(`- WhatsApp / phone: ${profile.whatsapp}`);
  if (profile.employees) lines.push(`- Employees: ${profile.employees}`);
  if (profile.revenue) lines.push(`- Revenue band: ${profile.revenue}`);

  const promptBlock = lines.join('\n');

  return {
    promptBlock,
    profile,
    opportunity,
    tiers,
    requiredDocuments,
    matchedDocuments,
    missingDocuments,
    eligibility,
    suggestedTier,
  };
}

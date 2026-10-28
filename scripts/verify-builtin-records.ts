// scripts/verify-builtin-records.ts
/**
 * Verifies that every record in constants.MOCK_FUNDING can flow through the
 * reviewed-directory pipeline without losing data. For each record:
 *
 *   1. Re-derive its status from its dates via computeStatus() so a stored
 *      "OPEN" can never outlive its closing date.
 *   2. Map the FundingOpportunityDb back into an ExtractedOpportunity (the
 *      shape the intake screen shows when an admin opens a record).
 *   3. Run publishProblems() — the same function the admin publish button
 *      uses — and report any blockers that would prevent the admin from
 *      publishing the record as-is.
 *
 * Run:
 *   npx tsx scripts/verify-builtin-records.ts
 *
 * Output:
 *   A summary line per record: id, status, blockers (if any). Exits 0 when
 *   every record is publishable; exits 1 with a list of problems otherwise.
 *
 * Why: the README's task 6 says "Verify the 37 remaining built-in records by
 * running each through the review screen." This script does the programmatic
 * half — it catches records that would obviously fail validation, without
 * a human having to click 37 times.
 */

import { MOCK_FUNDING } from '../constants';
import type { ExtractedOpportunity, FundingOpportunityDb } from '../types';
import { publishProblems } from '../services/opportunityIntake';
import { computeStatus } from '../services/opportunityStatus';

/** Convert a published FundingOpportunityDb back into the ExtractedOpportunity
 * shape that the admin review screen renders. Used only for verification. */
function toExtracted(opp: FundingOpportunityDb): ExtractedOpportunity {
  return {
    programme_name: opp.programme_name,
    issuer_name: opp.issuer_name,
    issuer_type: opp.issuer_type,
    funding_type: typeof opp.funding_type === 'string' ? opp.funding_type : null,
    cycle_label: opp.cycle_label ?? null,
    opening_date: opp.opening_date ?? null,
    closing_date: /^\d{4}-\d{2}-\d{2}$/.test(opp.closing_date) ? opp.closing_date : null,
    closing_date_text: !/^\d{4}-\d{2}-\d{2}$/.test(opp.closing_date) ? opp.closing_date : null,
    is_rolling: opp.frequency?.toLowerCase().includes('rolling') || opp.frequency?.toLowerCase().includes('always open') || opp.closing_date === 'Rolling' ? true : null,
    geo_scope: opp.geo_scope,
    sector_tags: opp.sector_tags,
    sectors_excluded: opp.eligibility_rules?.sectors_excluded ?? [],
    age_min: opp.eligibility_rules?.age_min ?? null,
    age_max: opp.eligibility_rules?.age_max ?? null,
    youth_ownership_min_pct: opp.eligibility_rules?.youth_ownership_min_pct ?? null,
    amount_min: opp.amount_min || null,
    amount_max: opp.amount_max || null,
    thresholds: opp.thresholds ?? [],
    eligibility_summary: opp.eligibility_summary,
    required_documents: opp.required_documents,
    how_to_apply: opp.how_to_apply ?? null,
    application_channel: opp.application_channel ?? null,
    emailed_applications_accepted: opp.emailed_applications_accepted ?? null,
    application_url: opp.application_url,
    form_url: opp.pdf_form_url ?? null,
    contact_email: opp.contact_email || null,
    contact_phone: opp.contact_phone || null,
    evidence: [],
    risk_flags: [],
    extraction_notes: [],
  };
}

function main(): void {
  const now = new Date();
  let ok = 0;
  let flagged = 0;
  const flaggedRecords: { id: string; problems: string[]; status: string }[] = [];

  for (const opp of MOCK_FUNDING) {
    const extracted = toExtracted(opp);
    const problems = publishProblems(extracted);
    const status = computeStatus(opp.opening_date, opp.closing_date, now);
    if (problems.length === 0) {
      ok++;
      console.log(`✓ ${opp.opportunity_id} — ${opp.programme_name} — ${status}`);
    } else {
      flagged++;
      flaggedRecords.push({ id: opp.opportunity_id, problems, status });
      console.log(`✗ ${opp.opportunity_id} — ${opp.programme_name} — ${status}`);
      for (const p of problems) console.log(`    • ${p}`);
    }
  }

  console.log('');
  console.log(`Total: ${MOCK_FUNDING.length}  OK: ${ok}  Flagged: ${flagged}`);

  if (flagged > 0) {
    console.log('');
    console.log('Flagged records (would not pass the admin publish button as-is):');
    for (const r of flaggedRecords) {
      console.log(`  ${r.id} (${r.status}): ${r.problems.join('; ')}`);
    }
    process.exit(1);
  }
}

main();

// services/formTemplates/index.ts
/**
 * Registry of official forms the app knows how to fill.
 * To add a form: measure it (see kznYouthFund2026.ts), add its blank PDF under
 * public/assets/forms/, and list the template here.
 */
import type { FundingOpportunityDb } from '../../types';
import type { FormTemplate } from '../formModel';
import { KZN_YOUTH_FUND_2026 } from './kznYouthFund2026';
import { NYDA_GRANT_VOUCHER } from './nydaGrantVoucher';
import { SEFA_BLENDED_FINANCE } from './sefaBlendedFinance';

const TEMPLATES: FormTemplate[] = [KZN_YOUTH_FUND_2026, NYDA_GRANT_VOUCHER, SEFA_BLENDED_FINANCE];

export function findFormTemplate(
  opportunity: Pick<FundingOpportunityDb, 'programme_name' | 'issuer_name' | 'geo_scope' | 'closing_date'>
): FormTemplate | null {
  return TEMPLATES.find((t) => t.matches(opportunity)) ?? null;
}

export { KZN_YOUTH_FUND_2026, NYDA_GRANT_VOUCHER, SEFA_BLENDED_FINANCE };

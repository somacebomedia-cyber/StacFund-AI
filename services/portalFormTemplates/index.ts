// services/portalFormTemplates/index.ts
/**
 * Registry of online application portal templates (SEDFA eThuse / SMME Portal,
 * NYDA ERP). Each template captures the questions the portal asks for one
 * programme; the wizard emits a JSON object the applicant pastes into the
 * portal. There is no PDF to overlay — the portal is the system of record.
 *
 * To add a portal template: author a file in this folder, then list it here.
 */
import type { FundingOpportunityDb } from '../../types';
import type { PortalFormTemplate } from '../formModel';
import { SEDFA_AMAVULANDLELA } from './sedfaAmavulandlela';
import { SEDFA_TREP } from './sedfaTrep';
import { SEDFA_PEO_PLE_YOUTH } from './sedfaPeoPleYouth';
import { NYDA_ERP_GRANT } from './nydaErpGrant';

const TEMPLATES: PortalFormTemplate[] = [
  SEDFA_AMAVULANDLELA,
  SEDFA_TREP,
  SEDFA_PEO_PLE_YOUTH,
  NYDA_ERP_GRANT,
];

export function findPortalTemplate(
  opportunity: Pick<FundingOpportunityDb, 'programme_name' | 'issuer_name' | 'geo_scope' | 'closing_date'>
): PortalFormTemplate | null {
  return TEMPLATES.find((t) => t.matches(opportunity)) ?? null;
}

export {
  SEDFA_AMAVULANDLELA,
  SEDFA_TREP,
  SEDFA_PEO_PLE_YOUTH,
  NYDA_ERP_GRANT,
};

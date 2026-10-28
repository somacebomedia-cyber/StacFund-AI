// utils/studioDocxExport.ts
/**
 * StacFund — Word (.docx) export for the studios (client side)
 * ============================================================
 * POSTs the typed document JSON (as text/plain, matching the PDF-export
 * pattern that bypasses the global express.json limit) to the server's DOCX
 * builders, then triggers the browser download. Auth-gated server-side.
 */
import { auth } from '../services/firebase';
import type { PlanDocument } from '../services/businessPlan/planSchema';
import type { ProposalDocument } from '../services/proposal/proposalSchema';

export interface DocxBrandPayload {
  businessName?: string;
  tagline?: string;
  logoDataUrl?: string;
  logoWidth?: number;
  logoHeight?: number;
  accentColor?: string;
}

export interface DocxResult {
  ok: boolean;
  error?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
  const user = auth.currentUser;
  if (user) {
    try {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    } catch {
      /* proceed unauthenticated; the server will decide */
    }
  }
  return headers;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function postForDocx(
  path: string,
  payload: unknown,
  filename: string,
  onProgress?: (msg: string) => void
): Promise<DocxResult> {
  onProgress?.('Building your Word document…');
  const res = await fetch(`${path}?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `Server responded ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      /* not json */
    }
    return { ok: false, error: detail };
  }
  const blob = await res.blob();
  if (blob.size < 1024) return { ok: false, error: 'The generated document came back empty.' };
  triggerDownload(blob, filename);
  return { ok: true };
}

export async function exportPlanDocx(
  plan: PlanDocument,
  filename: string,
  brand?: DocxBrandPayload,
  opts: { onProgress?: (msg: string) => void } = {}
): Promise<DocxResult> {
  try {
    return await postForDocx('/api/plan/export-docx', { plan, brand }, filename, opts.onProgress);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Word export failed. Please try again.' };
  }
}

export async function exportProposalDocx(
  proposal: ProposalDocument,
  filename: string,
  brand?: DocxBrandPayload,
  opts: { onProgress?: (msg: string) => void } = {}
): Promise<DocxResult> {
  try {
    return await postForDocx('/api/proposal/export-docx', { proposal, brand }, filename, opts.onProgress);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Word export failed. Please try again.' };
  }
}

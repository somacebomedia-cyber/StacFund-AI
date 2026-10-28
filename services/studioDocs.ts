// services/studioDocs.ts
/**
 * StacFund — Studio document persistence (Firestore save/resume)
 * ==============================================================
 * Cloud save + list + resume + delete for both studio outputs:
 *
 *   Business plans   → users/{uid}/plans/{planId}        { plan, req, …summary }
 *   Funding proposals→ users/{uid}/proposals/{proposalId}{ doc,  …summary }
 *
 * Each stored doc carries denormalised summary fields (title, businessName,
 * word/page estimates, updatedAt) so the "saved documents" lists render
 * without any extra index collection. Firestore charges per document read,
 * not per byte — lists are capped at 12 docs per studio.
 *
 * Local checkpoints (localStorage, per-studio) remain the FIRST resume
 * source for interrupted generations; these cloud docs are the durable,
 * cross-device record.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { PlanDocument } from './businessPlan/planSchema';
import { documentWordCount } from './businessPlan/planSchema';
import type { ProposalDocument } from './proposal/proposalSchema';
import type { PlanGenRequest } from './businessPlan/planGenerator';

export type StudioDocKind = 'plan' | 'proposal';

export interface SavedDocSummary {
  id: string;
  kind: StudioDocKind;
  /** e.g. "Nawi-Learn — Business Plan" */
  title: string;
  businessName: string;
  updatedAt: number;
  createdAt?: number;
  /** Prose word count (plans) or section count (proposals). */
  words: number;
  /** Rough page estimate for list display. */
  pagesEst: number;
}

const LIST_LIMIT = 12;

// ─── Business plans ──────────────────────────────────────────────────────────

function planSummaryFields(plan: PlanDocument) {
  const words = documentWordCount(plan);
  return {
    title: `${plan.meta.businessName || 'Business'} — ${plan.meta.planTitle || 'Business Plan'}`,
    businessName: plan.meta.businessName || '',
    words,
    // Calibrated to the same density the plan studio uses for live estimates,
    // plus a fixed allowance for cover/TOC/chapter openers.
    pagesEst: Math.max(1, Math.round(words / 360) + 6),
  };
}

export async function savePlanDoc(
  userId: string,
  plan: PlanDocument,
  req?: PlanGenRequest | null
): Promise<void> {
  const summary = planSummaryFields(plan);
  await setDoc(
    doc(db, 'users', userId, 'plans', plan.id),
    {
      plan,
      req: req ?? null,
      ...summary,
      updatedAt: Date.now(),
      createdAt: plan.createdAt || Date.now(),
    },
    { merge: true }
  );
}

export async function listSavedPlans(userId: string): Promise<SavedDocSummary[]> {
  try {
    const q = query(
      collection(db, 'users', userId, 'plans'),
      orderBy('updatedAt', 'desc'),
      fsLimit(LIST_LIMIT)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          kind: 'plan' as const,
          title: String(raw.title || 'Business plan'),
          businessName: String(raw.businessName || ''),
          updatedAt: Number(raw.updatedAt) || 0,
          createdAt: Number(raw.createdAt) || undefined,
          words: Number(raw.words) || 0,
          pagesEst: Number(raw.pagesEst) || 0,
        };
      })
      .filter((s) => s.updatedAt > 0);
  } catch (e) {
    console.warn('[studioDocs] plan list failed', e);
    return [];
  }
}

export async function getPlanDoc(
  userId: string,
  planId: string
): Promise<{ plan: PlanDocument; req: PlanGenRequest | null } | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'plans', planId));
    if (!snap.exists()) return null;
    const raw = snap.data() as { plan?: PlanDocument; req?: PlanGenRequest | null };
    if (!raw?.plan?.chapters?.length) return null;
    return { plan: raw.plan, req: raw.req ?? null };
  } catch (e) {
    console.warn('[studioDocs] plan get failed', e);
    return null;
  }
}

export async function deletePlanDoc(userId: string, planId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'plans', planId));
}

// ─── Funding proposals ───────────────────────────────────────────────────────

function proposalSummaryFields(proposal: ProposalDocument) {
  const included = proposal.sections.filter((s) => s.include);
  const words = included.reduce(
    (n, s) =>
      n +
      s.paragraphs.reduce((m, p) => m + p.trim().split(/\s+/).filter(Boolean).length, 0) +
      s.bullets.reduce((m, b) => m + b.trim().split(/\s+/).filter(Boolean).length, 0),
    0
  );
  return {
    title: `${proposal.meta.businessName || 'Business'} — ${proposal.meta.tagline || 'Funding proposal'}`,
    businessName: proposal.meta.businessName || '',
    words,
    // Proposal studio pages: cover + sections + closing, ~240 words/page.
    pagesEst: Math.max(2, Math.round(words / 240) + included.length + 2),
  };
}

/** Generates a stable id for a proposal document (it has no id field). */
export function newProposalDocId(): string {
  return `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveProposalDoc(
  userId: string,
  proposalId: string,
  proposal: ProposalDocument
): Promise<void> {
  const summary = proposalSummaryFields(proposal);
  await setDoc(
    doc(db, 'users', userId, 'proposals', proposalId),
    {
      doc: proposal,
      ...summary,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function listSavedProposals(userId: string): Promise<SavedDocSummary[]> {
  try {
    const q = query(
      collection(db, 'users', userId, 'proposals'),
      orderBy('updatedAt', 'desc'),
      fsLimit(LIST_LIMIT)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          kind: 'proposal' as const,
          title: String(raw.title || 'Funding proposal'),
          businessName: String(raw.businessName || ''),
          updatedAt: Number(raw.updatedAt) || 0,
          words: Number(raw.words) || 0,
          pagesEst: Number(raw.pagesEst) || 0,
        };
      })
      .filter((s) => s.updatedAt > 0);
  } catch (e) {
    console.warn('[studioDocs] proposal list failed', e);
    return [];
  }
}

export async function getProposalDoc(
  userId: string,
  proposalId: string
): Promise<ProposalDocument | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'proposals', proposalId));
    if (!snap.exists()) return null;
    const raw = snap.data() as { doc?: ProposalDocument };
    if (!raw?.doc?.sections) return null;
    return raw.doc;
  } catch (e) {
    console.warn('[studioDocs] proposal get failed', e);
    return null;
  }
}

export async function deleteProposalDoc(userId: string, proposalId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'proposals', proposalId));
}

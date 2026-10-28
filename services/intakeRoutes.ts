// services/intakeRoutes.ts
/**
 * StacFund — Admin routes for the funding intake & review queue (SERVER ONLY)
 * ===========================================================================
 *   GET    /api/intake/me                      am I an admin?
 *   POST   /api/intake/extract                 poster / PDF / pasted text  -> pending draft(s)
 *   GET    /api/intake/drafts?status=pending   the review queue
 *   PUT    /api/intake/drafts/:id              save edits
 *   POST   /api/intake/drafts/:id/publish      put it in the public directory
 *   POST   /api/intake/drafts/:id/reject       discard it
 *
 * Security notes:
 *   - Every route verifies a real Firebase ID token (no bypass header, no
 *     unsigned-token fallback) and then checks the allowlist in ADMIN_EMAILS
 *     and/or ADMIN_UIDS. If neither is set, nobody is an admin (fail closed).
 *   - Authentication runs BEFORE the body is parsed, so strangers cannot make
 *     the server buffer large uploads.
 *   - Register this BEFORE the global express.json() in server.ts, because
 *     these routes accept bodies larger than its default 100 kB limit.
 */

import express from 'express';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { DraftRecord, DraftWithId, OpportunitySourceType } from '../types';
import {
  IntakeError,
  createDraft,
  extractOpportunities,
  getDraft,
  listDrafts,
  mergeIntoDraft,
  publishDraft,
  rejectDraft,
  updateDraft,
} from './opportunityIntake';
import type { GenerateFn, IntakeInput } from './opportunityIntake';

export const INTAKE_BASE_PATH = '/api/intake';

export interface IntakeRouteDeps {
  db: Firestore | null;
  adminAuth: Auth | null;
  /** Test hook: replaces the Gemini call. Leave undefined in production. */
  generate?: GenerateFn;
}

interface AdminInfo {
  uid: string;
  email: string | null;
}

// ─── Admin allowlist ─────────────────────────────────────────────────────────

function parseList(value: string | undefined, lowercase: boolean): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => (lowercase ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean);
}

export function isAdmin(
  decoded: Pick<DecodedIdToken, 'uid' | 'email' | 'email_verified'>,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (parseList(env.ADMIN_UIDS, false).includes(decoded.uid)) return true;
  const emails = parseList(env.ADMIN_EMAILS, true);
  return Boolean(decoded.email) && decoded.email_verified === true && emails.includes((decoded.email ?? '').toLowerCase());
}

function requireAdmin(deps: IntakeRouteDeps): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!deps.adminAuth) {
      res.status(503).json({ error: 'Authentication is not configured on the server.', details: [] });
      return;
    }
    if (!parseList(process.env.ADMIN_EMAILS, true).length && !parseList(process.env.ADMIN_UIDS, false).length) {
      res.status(403).json({ error: 'No admins are configured. Set ADMIN_EMAILS (or ADMIN_UIDS) on the server.', details: [] });
      return;
    }
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Please sign in again.', details: [] });
      return;
    }
    try {
      const decoded = await deps.adminAuth.verifyIdToken(header.slice('Bearer '.length));
      if (!isAdmin(decoded)) {
        res.status(403).json({
          error: 'This account is not an admin. Check ADMIN_EMAILS / ADMIN_UIDS, and that the email is verified.',
          details: [],
        });
        return;
      }
      const info: AdminInfo = { uid: decoded.uid, email: decoded.email ?? null };
      res.locals.admin = info;
      next();
    } catch {
      res.status(401).json({ error: 'Your session has expired. Please sign in again.', details: [] });
    }
  };
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function sendError(res: Response, err: unknown): void {
  if (err instanceof IntakeError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  console.error('[Intake] Unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.', details: [] });
}

function handler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => {
    fn(req, res).catch((err: unknown) => sendError(res, err));
  };
}

function requireDb(deps: IntakeRouteDeps): Firestore {
  if (!deps.db) throw new IntakeError(503, 'The database is not configured on the server.');
  return deps.db;
}

function adminOf(res: Response): AdminInfo {
  return res.locals.admin as AdminInfo;
}

interface ParsedExtract {
  input: IntakeInput;
  sourceType: OpportunitySourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  mergeIntoDraftId: string | null;
}

function parseExtractBody(body: unknown): ParsedExtract {
  if (!body || typeof body !== 'object') throw new IntakeError(400, 'Send a JSON body.');
  const b = body as Record<string, unknown>;
  const sourceUrl =
    typeof b.sourceUrl === 'string' && /^https?:\/\/\S+$/i.test(b.sourceUrl.trim()) ? b.sourceUrl.trim().slice(0, 500) : null;
  const mergeIntoDraftId = typeof b.mergeIntoDraftId === 'string' && b.mergeIntoDraftId.trim() ? b.mergeIntoDraftId.trim() : null;
  const sourceName = typeof b.fileName === 'string' && b.fileName.trim() ? b.fileName.trim().slice(0, 200) : null;

  if (b.kind === 'file') {
    if (typeof b.mimeType !== 'string' || typeof b.dataBase64 !== 'string') {
      throw new IntakeError(400, 'A file needs "mimeType" and "dataBase64".');
    }
    const dataBase64 = b.dataBase64.replace(/^data:[^;]+;base64,/, '');
    const sourceType: OpportunitySourceType = b.mimeType === 'application/pdf' ? 'pdf' : 'poster';
    return { input: { kind: 'file', mimeType: b.mimeType, dataBase64 }, sourceType, sourceName, sourceUrl, mergeIntoDraftId };
  }
  if (b.kind === 'text') {
    if (typeof b.text !== 'string') throw new IntakeError(400, 'Text intake needs a "text" field.');
    return { input: { kind: 'text', text: b.text }, sourceType: 'text', sourceName, sourceUrl, mergeIntoDraftId };
  }
  throw new IntakeError(400, 'kind must be "file" or "text".');
}

const DRAFT_STATUSES: DraftRecord['review_status'][] = ['pending', 'published', 'rejected'];

// ─── Registration ────────────────────────────────────────────────────────────

export function registerIntakeRoutes(app: Express, deps: IntakeRouteDeps): void {
  const router = express.Router();

  const extractLimiter = rateLimit({ windowMs: 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false });

  router.use(requireAdmin(deps));
  router.use(express.json({ limit: '15mb' }));

  router.get(
    '/me',
    handler(async (_req, res) => {
      res.json({ admin: true, email: adminOf(res).email });
    })
  );

  router.post(
    '/extract',
    extractLimiter,
    handler(async (req, res) => {
      const db = requireDb(deps);
      const parsed = parseExtractBody(req.body);
      const extracted = await extractOpportunities(parsed.input, deps.generate);
      if (!extracted.length) {
        throw new IntakeError(422, 'No funding opportunity was found in that document. Try a clearer photo, or paste the text instead.');
      }

      const drafts: DraftWithId[] = [];
      const warnings: string[] = [];

      if (parsed.mergeIntoDraftId) {
        drafts.push(await mergeIntoDraft(db, parsed.mergeIntoDraftId, extracted[0]));
        if (extracted.length > 1) {
          warnings.push(`The document described ${extracted.length} opportunities. Only the first was added to this record.`);
        }
      } else {
        for (const item of extracted) {
          const result = await createDraft(db, {
            extracted: item,
            sourceType: parsed.sourceType,
            sourceName: parsed.sourceName,
            sourceUrl: parsed.sourceUrl,
            submittedBy: adminOf(res).uid,
            origin: 'manual',
          });
          if (result.outcome === 'skipped') continue;
          if (result.outcome === 'merged') warnings.push('This looked like a repeat of a draft already in the queue, so the new details were added to it.');
          if (result.outcome === 'created' && result.duplicateOf) {
            warnings.push('An opportunity with the same name and year is already published. Publishing this draft will replace it.');
          }
          drafts.push(await getDraft(db, result.id));
        }
      }
      res.json({ drafts, warnings });
    })
  );

  router.get(
    '/drafts',
    handler(async (req, res) => {
      const db = requireDb(deps);
      const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
      if (!DRAFT_STATUSES.includes(status as DraftRecord['review_status'])) {
        throw new IntakeError(400, 'status must be pending, published or rejected.');
      }
      const drafts = await listDrafts(db, status as DraftRecord['review_status'], 50);
      res.json({ drafts });
    })
  );

  router.put(
    '/drafts/:id',
    handler(async (req, res) => {
      const db = requireDb(deps);
      const body = (req.body ?? {}) as { extracted?: unknown };
      if (body.extracted === undefined) throw new IntakeError(400, 'Send the edited record as "extracted".');
      const draft = await updateDraft(db, String(req.params.id), body.extracted);
      res.json({ draft });
    })
  );

  router.post(
    '/drafts/:id/publish',
    handler(async (req, res) => {
      const db = requireDb(deps);
      const body = (req.body ?? {}) as { extracted?: unknown; officialSource?: unknown };
      const record = await publishDraft(db, String(req.params.id), {
        edited: body.extracted,
        officialSource: body.officialSource === true,
        reviewer: adminOf(res).uid,
      });
      res.json({ published: record });
    })
  );

  router.post(
    '/drafts/:id/reject',
    handler(async (req, res) => {
      const db = requireDb(deps);
      const body = (req.body ?? {}) as { reason?: unknown };
      await rejectDraft(db, String(req.params.id), adminOf(res).uid, typeof body.reason === 'string' ? body.reason : null);
      res.json({ ok: true });
    })
  );

  // JSON errors for body-parser problems (too large, malformed JSON) instead of an HTML page.
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'That upload is too large. Keep files under 10 MB.', details: [] });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'The request body was not valid JSON.', details: [] });
      return;
    }
    sendError(res, err);
  });

  app.use(INTAKE_BASE_PATH, router);
}

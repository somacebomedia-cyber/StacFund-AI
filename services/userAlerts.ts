// services/userAlerts.ts
/**
 * StacFund — User alerts (SERVER ONLY)
 * ===================================
 * When an admin publishes an opportunity, this service walks every user's
 * profile, evaluates the hard-rule eligibility, and for each eligible user
 * who has opted in:
 *
 *   1. Writes an in-app notification doc to users/{uid}/notifications
 *   2. Sends an email (if SMTP creds + opt-in)
 *   3. Sends a WhatsApp message (if TWILIO creds + opt-in)
 *   4. Sends a push via Firebase Cloud Messaging (if FCM creds + opt-in)
 *
 * De-duplicates via users/{uid}/alerts_sent/{opportunity_id}. Silent
 * no-op for any channel whose env vars are missing. Never throws — a
 * failed alert must not block the publish.
 *
 * Usage:
 *   await notifyMatchingUsers(db, publishedOpportunity);
 *
 * Required env vars (all optional — only the in-app notification fires
 * when none are set):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_FROM_EMAIL
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   FCM_SERVER_KEY  (legacy HTTP v1 legacy API) OR FIREBASE_SERVICE_ACCOUNT_KEY (already used)
 *
 * User preferences are read from users/{uid}.alertPrefs:
 *   { emailOptIn: boolean, whatsappOptIn: boolean, pushOptIn: boolean,
 *     whatsappNumber: string | null, email: string | null,
 *     digest: 'immediate' | 'daily' }
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { FundingOpportunityDb, UserBusinessProfile } from '../types';
import { evaluateEligibility } from './eligibilityEngine';

export interface AlertPrefs {
  emailOptIn: boolean;
  whatsappOptIn: boolean;
  pushOptIn: boolean;
  whatsappNumber: string | null;
  email: string | null;
  digest: 'immediate' | 'daily';
}

const DEFAULT_PREFS: AlertPrefs = {
  emailOptIn: true,
  whatsappOptIn: false,
  pushOptIn: true,
  whatsappNumber: null,
  email: null,
  digest: 'immediate',
};

const ALERT_TYPES = ['email', 'whatsapp', 'push', 'in_app'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}`;
}

function summariseOpportunity(opp: FundingOpportunityDb): string {
  const amount =
    opp.amount_min && opp.amount_max
      ? `${fmtMoney(opp.amount_min)}–${fmtMoney(opp.amount_max)}`
      : opp.amount_min
        ? fmtMoney(opp.amount_min)
        : 'amount not specified';
  const closing = opp.closing_date && opp.closing_date !== 'Rolling' && opp.closing_date !== 'Unknown'
    ? ` Closes ${opp.closing_date}.`
    : '';
  return `${opp.programme_name} — ${opp.issuer_name} (${opp.funding_type || 'Funding'}, ${amount}).${closing} Apply: ${opp.application_url || 'see opportunity page'}`;
}

function shortSummary(opp: FundingOpportunityDb): string {
  return `${opp.programme_name} (${opp.issuer_name})`;
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  // SMTP creds all required for email.
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.ALERT_FROM_EMAIL;
  if (!host || !port || !user || !pass || !from) return false;
  try {
    // Lazy-import nodemailer so the build doesn't need it when SMTP isn't used.
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, text: body });
    return true;
  } catch (e) {
    console.warn('[Alerts] Email send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
  if (!sid || !token || !from) return false;
  if (!to.startsWith('whatsapp:')) to = `whatsapp:${to.replace(/[^\d+]/g, '')}`;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body.slice(0, 1500) }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[Alerts] WhatsApp send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function sendPush(token: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
  const fcmKey = process.env.FCM_SERVER_KEY;
  if (!fcmKey) return false;
  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${fcmKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        notification: { title: title.slice(0, 100), body: body.slice(0, 200) },
        data: data ?? {},
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[Alerts] Push send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function writeInAppNotification(db: Firestore, userId: string, opp: FundingOpportunityDb): Promise<void> {
  const notifRef = db.collection('users').doc(userId).collection('notifications');
  await notifRef.add({
    title: `New match: ${shortSummary(opp)}`,
    message: summariseOpportunity(opp),
    date: new Date().toISOString(),
    isRead: false,
    type: 'info',
    actionPage: 'funding',
    opportunityId: opp.opportunity_id,
    cutoffDate: opp.closing_date ?? null,
  });
}

async function alreadyAlerted(db: Firestore, userId: string, oppId: string): Promise<boolean> {
  const ref = db.collection('users').doc(userId).collection('alerts_sent').doc(oppId);
  const snap = await ref.get();
  return snap.exists;
}

async function markAlerted(db: Firestore, userId: string, oppId: string, channels: string[]): Promise<void> {
  const ref = db.collection('users').doc(userId).collection('alerts_sent').doc(oppId);
  await ref.set({
    opportunity_id: oppId,
    alerted_at: new Date().toISOString(),
    channels,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read one user's alert preferences. Falls back to defaults if the doc is
 * missing or unreadable.
 */
export async function getAlertPrefs(db: Firestore, userId: string): Promise<AlertPrefs> {
  try {
    const snap = await db.collection('users').doc(userId).collection('alert_prefs').doc('main').get();
    if (!snap.exists) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(snap.data() as Partial<AlertPrefs>) };
  } catch (e) {
    console.warn('[Alerts] Could not read alert prefs', e);
    return DEFAULT_PREFS;
  }
}

/**
 * Server-side: walk every user that has a profile, evaluate eligibility for
 * `opp`, and notify the eligible ones. Caps the work at MAX_USERS_PER_OPP
 * to bound latency on a busy server.
 *
 * Call this from `publishDraft()` after the Firestore write commits.
 * NEVER throws — alert failures must not roll back a publish.
 */
export async function notifyMatchingUsers(
  db: Firestore,
  opp: FundingOpportunityDb,
  opts: { maxUsers?: number; now?: Date } = {}
): Promise<{ scanned: number; notified: number; channels: Record<string, number> }> {
  const MAX = opts.maxUsers ?? 500;
  const channels: Record<string, number> = { email: 0, whatsapp: 0, push: 0, in_app: 0 };
  let scanned = 0;
  let notified = 0;

  try {
    // One equality filter only (no composite index needed). Skip users
    // without a profile — they cannot be evaluated.
    const snap = await db.collection('users').where('profile', '!=', null).limit(MAX).get();
    for (const userDoc of snap.docs) {
      scanned++;
      const data = userDoc.data() as {
        profile?: Record<string, unknown>;
        ownerInfo?: Record<string, unknown>;
        alert_prefs?: AlertPrefs;
      };
      if (!data.profile) continue;

      // Synthesize a UserBusinessProfile the same way the browser does.
      const ownerInfo = data.ownerInfo ?? {};
      const ageNum = Number((ownerInfo as Record<string, unknown>).age);
      const profile = data.profile;
      const userProfile: UserBusinessProfile = {
        user_id: userDoc.id,
        business_status: (profile.registered as string) === 'Yes' ? 'REGISTERED' : 'CONCEPT',
        entity_type: ((profile.type as string) || (profile.entity_type as string) || 'PTY_LTD') as string,
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

      // Skip users who don't pass the hard rules. Users with `unknown` rules
      // (missing data) ARE notified — we don't want to hide opportunities
      // just because the user hasn't filled in their province yet.
      const verdict = evaluateEligibility(userProfile, opp);
      if (!verdict.eligible) continue;

      // Skip users we have already alerted for this opportunity.
      if (await alreadyAlerted(db, userDoc.id, opp.opportunity_id)) continue;

      const prefs: AlertPrefs = { ...DEFAULT_PREFS, ...(data.alert_prefs ?? {}) };
      const sent: string[] = [];

      // 1. In-app notification — always fires; costs nothing and powers the
      //    bell-icon badge in the header.
      try {
        await writeInAppNotification(db, userDoc.id, opp);
        channels.in_app++;
        sent.push('in_app');
      } catch (e) {
        console.warn('[Alerts] Could not write in-app notification for', userDoc.id, e);
      }

      // 2. Email
      if (prefs.emailOptIn && prefs.email) {
        const ok = await sendEmail(
          prefs.email,
          `New funding match: ${shortSummary(opp)}`,
          `A new funding opportunity matches your profile:\n\n${summariseOpportunity(opp)}\n\nSign in to StacFund to apply.`
        );
        if (ok) {
          channels.email++;
          sent.push('email');
        }
      }

      // 3. WhatsApp
      if (prefs.whatsappOptIn && prefs.whatsappNumber) {
        const ok = await sendWhatsApp(
          prefs.whatsappNumber,
          `New funding match on StacFund:\n${summariseOpportunity(opp)}`
        );
        if (ok) {
          channels.whatsapp++;
          sent.push('whatsapp');
        }
      }

      // 4. Push (FCM) — token comes from users/{uid}.fcm_token, refreshed by
      //    the browser on each session.
      if (prefs.pushOptIn) {
        const fcmTokenDoc = await db.collection('users').doc(userDoc.id).collection('device_tokens').limit(1).get();
        if (!fcmTokenDoc.empty) {
          const token = (fcmTokenDoc.docs[0].data().token as string) || '';
          if (token) {
            const ok = await sendPush(token, 'New funding match', shortSummary(opp), {
              opportunityId: opp.opportunity_id,
              actionPage: 'funding',
            });
            if (ok) {
              channels.push++;
              sent.push('push');
            }
          }
        }
      }

      if (sent.length > 0) {
        notified++;
        await markAlerted(db, userDoc.id, opp.opportunity_id, sent);
      }
    }
  } catch (e) {
    console.warn('[Alerts] notifyMatchingUsers failed partway through:', e);
  }

  return { scanned, notified, channels };
}

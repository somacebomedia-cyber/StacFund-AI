/**
 * StacFund Advanced Funding Scraper
 * =================================
 * Daily Playwright + Gemini-powered scraper that:
 *   1. Launches a headless Chromium browser (bypasses JS-rendered portals)
 *   2. Extracts page HTML + discovers PDF links
 *   3. Downloads + parses PDF brochures with pdf-parse
 *   4. Feeds the text to Gemini for structured JSON extraction
 *   5. Writes new opportunities to Firestore (deduped by programme_name)
 *
 * IMPORTANT: This module is server-only. It must NOT be imported from client
 * code (it uses Playwright + Node-only APIs). It receives the Firebase Admin
 * `db` instance from server.ts — do NOT import the client SDK here.
 *
 * FIX (2026-06-28): The previous version of this file imported modular
 * client-SDK functions — `collection`, `query`, `where`, `getDocs`, `addDoc`
 * — from `firebase-admin/firestore`. Those functions don't exist on that
 * package; they're part of the *client* SDK's v9 modular API
 * (`firebase/firestore`). The Admin SDK instead uses chained methods on the
 * Firestore/CollectionReference objects themselves:
 *   adminDb.collection('x').where('field', '==', val).get()
 *   adminDb.collection('x').add(data)
 * This file now uses that calling convention throughout, so it actually
 * compiles and runs against firebase-admin.
 *
 * Wiring: server.ts imports and calls `startScraper(adminDb)`. A daily cron
 * fires at 03:00 SAST. A manual /api/scraper/run endpoint is also exposed.
 *
 * ALSO REQUIRED (not a code fix, but won't run without it): Playwright needs
 * its browser binary downloaded once, separately from `npm install`:
 *   npx playwright install chromium
 * If you're deploying to a host with no shell access for this step, do it
 * as part of your build command, not just locally.
 */

import { chromium } from 'playwright';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { GoogleGenAI } from '@google/genai';
import cron from 'node-cron';
import type { Firestore } from 'firebase-admin/firestore';

// ─── Institution Source URLs ──────────────────────────────────────────────
// Extracted from constants.ts — all 37 real institutions with known portals.
// The 124 "Private / Government N" placeholders have no public URL and are
// skipped by the scraper (they exist only as seed data).
export const INSTITUTION_URLS: { name: string; url: string }[] = [
  { name: 'NYDA', url: 'https://www.nyda.gov.za/Products-Services/NYDA-Grant-Programme' },
  { name: 'TIA', url: 'https://www.tia.org.za' },
  { name: 'SEFA', url: 'https://www.sefa.org.za/products/direct-lending' },
  { name: 'NEF', url: 'https://www.nefcorp.co.za/imbewu-fund/' },
  { name: 'IDC', url: 'https://www.idc.co.za/funding/' },
  { name: 'Land Bank', url: 'https://landbank.co.za' },
  { name: 'DBSA', url: 'https://www.dbsa.org' },
  { name: 'ECDC', url: 'https://www.ecdc.co.za' },
  { name: 'GEP', url: 'https://www.gep.co.za' },
  { name: 'Ithala', url: 'https://www.ithala.co.za' },
  { name: 'LEDA', url: 'https://www.lieda.co.za' },
  { name: 'NWDC', url: 'https://nwdc.co.za' },
  { name: 'FDC', url: 'https://fdc.co.za' },
  { name: 'MEGA', url: 'https://mega.gov.za' },
  { name: 'Casidra', url: 'https://www.casidra.co.za' },
  { name: 'Business Partners', url: 'https://www.businesspartners.co.za' },
  { name: 'USAID Prosper Africa', url: 'https://www.prosperafrica.gov' },
  // JSE-listed enterprise development programmes
  { name: 'AECI', url: 'https://www.aeciworld.com' },
  { name: 'ArcelorMittal', url: 'https://www.arcelormittalsa.com' },
  { name: 'Aspen Pharmacare', url: 'https://www.aspenpharma.com' },
  { name: 'Blue Label Telecoms', url: 'https://www.bluelabeltelecoms.co.za' },
  { name: 'BATSA', url: 'https://www.batsa.co.za' },
  { name: 'Glencore', url: 'https://www.glencore.com' },
  { name: 'Hyprop', url: 'https://www.hyprop.co.za' },
  { name: 'Italtile', url: 'https://www.italtile.com' },
  { name: 'Lewis Group', url: 'https://www.lewisgroup.co.za' },
  { name: 'Momentum Metropolitan', url: 'https://www.momentummetropolitan.co.za' },
  { name: 'Mpact', url: 'https://www.mpact.co.za' },
  { name: 'Nampak', url: 'https://www.nampak.com' },
  { name: 'Northam Platinum', url: 'https://www.northam.co.za' },
  { name: 'Pan African Resources', url: 'https://www.panafricanresources.com' },
  { name: 'Quantum Foods', url: 'https://www.quantumfoods.co.za' },
  { name: 'Resilient REIT', url: 'https://www.resilient.co.za' },
  { name: 'Tharisa', url: 'https://tharisa.com' },
  { name: 'Truworths', url: 'https://www.truworths.co.za' },
  { name: 'Vukile', url: 'https://www.vukile.co.za' },
];

// ─── Gemini client (server-side, direct URL — no proxy) ───────────────────
// In Node contexts we hit the Gemini API directly. The proxy at /api/gemini
// is only needed for browser calls (to avoid exposing the API key).
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  // No httpOptions.baseUrl — uses the default https://generativelanguage.googleapis.com
});

let adminDb: Firestore | null = null;
let isRunning = false;

// ─── Scraper Core ─────────────────────────────────────────────────────────

async function scrapeDynamicSite(url: string) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const pdfLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href => href.toLowerCase().endsWith('.pdf'))
    );
    return { html, pdfLinks };
  } catch (e) {
    console.warn(`[Scraper] Failed to scrape ${url}:`, e);
    return { html: '', pdfLinks: [] };
  } finally {
    await browser.close();
  }
}

async function downloadAndParsePdf(pdfUrl: string) {
  try {
    const res = await fetch(pdfUrl, { redirect: 'follow' });
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    // Cap at 15k chars to stay within Gemini context limits
    return (await pdfParse(buf)).text.substring(0, 15000);
  } catch (e) {
    console.warn(`[Scraper] PDF parse failed for ${pdfUrl}:`, e);
    return '';
  }
}

async function extractOpportunities(text: string, instName: string) {
  if (!text.trim() || text.length < 100) return [];
  const prompt = `Extract funding opportunities from this text scraped from ${instName}. Return ONLY a JSON array (no markdown, no commentary). Schema per item: {"programme_name":"string","funding_type":"GRANT|LOAN|EQUITY|COMPETITION","amount_min":0,"amount_max":0,"closing_date":"YYYY-MM-DD or Rolling","status":"OPEN|CLOSED|UPCOMING","eligibility_summary":"string","source_url":"string"}`;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `${prompt}\n\nCONTENT:\n${text}`,
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(res.text || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn(`[Scraper] Gemini extraction failed for ${instName}:`, e);
    return [];
  }
}

/**
 * Save newly-scraped opportunities to Firestore, deduped by programme_name.
 *
 * Uses the Admin SDK's chained query API (\`collection().where().get()\` /
 * \`collection().add()\`), NOT the modular client-SDK functions. This is the
 * piece that was broken before — see the FIX note at the top of this file.
 */
async function saveAndNotify(opps: any[], instName: string) {
  if (!adminDb) {
    console.warn('[Scraper] Admin DB not initialized — skipping save');
    return;
  }
  let saved = 0;
  const oppsCollection = adminDb.collection('funding_opportunities');

  for (const opp of opps) {
    if (!opp.programme_name) continue;

    // Dedup by programme_name — Admin SDK chained syntax.
    const existing = await oppsCollection
      .where('programme_name', '==', opp.programme_name)
      .limit(1)
      .get();
    if (!existing.empty) continue;

    await oppsCollection.add({
      ...opp,
      issuer_name: instName,
      last_verified_at: new Date().toISOString(),
      scraped_at: new Date().toISOString(),
      confidence_score: 75, // AI-extracted, not human-verified
    });
    saved++;
    // TODO: match against user profiles + send notifications
  }
  console.log(`[Scraper] Saved ${saved} new opportunities from ${instName}`);
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function runAdvancedScraper() {
  if (isRunning) {
    console.log('[Scraper] Already running — skipping');
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Scraper] GEMINI_API_KEY not set — skipping');
    return;
  }
  isRunning = true;
  console.log(`[Scraper] Starting run for ${INSTITUTION_URLS.length} institutions`);

  let totalSaved = 0;
  for (const inst of INSTITUTION_URLS) {
    try {
      console.log(`[Scraper] Processing ${inst.name} (${inst.url})`);
      const { html, pdfLinks } = await scrapeDynamicSite(inst.url);
      const htmlOpps = await extractOpportunities(html, inst.name);
      await saveAndNotify(htmlOpps, inst.name);
      totalSaved += htmlOpps.length;

      // Parse up to 3 PDFs per institution (cap to avoid runaway)
      for (const pdf of pdfLinks.slice(0, 3)) {
        const pdfText = await downloadAndParsePdf(pdf);
        const pdfOpps = await extractOpportunities(pdfText, inst.name);
        await saveAndNotify(pdfOpps, inst.name);
        totalSaved += pdfOpps.length;
      }

      // Polite delay between institutions
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.error(`[Scraper] Error processing ${inst.name}:`, e);
    }
  }

  console.log(`[Scraper] Run complete. Total opportunities processed: ${totalSaved}`);
  isRunning = false;
}

/**
 * Initialize the scraper with the Firebase Admin DB instance and start the
 * daily cron. Call this once from server.ts after Firebase Admin is set up.
 */
export function startScraper(db: Firestore | null) {
  adminDb = db;

  if (!db) {
    console.warn('[Scraper] No Firestore instance — cron will not save results');
  }

  // Daily at 03:00 SAST (UTC+2) = 01:00 UTC
  cron.schedule('0 1 * * *', () => {
    console.log('[Scraper] Cron triggered — starting daily run');
    runAdvancedScraper().catch(e => console.error('[Scraper] Cron run failed:', e));
  }, {
    timezone: 'Africa/Johannesburg',
  });

  console.log('[Scraper] Cron scheduled for 03:00 SAST daily');
}

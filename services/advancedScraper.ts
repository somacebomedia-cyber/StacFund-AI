// services/advancedScraper.ts
/**
 * StacFund Funding Scraper (SERVER ONLY)
 * ======================================
 * Daily job that reads funder pages and PDFs and turns them into DRAFTS for an
 * admin to review. Nothing the scraper finds is shown to users until it is
 * published from the review queue (see services/opportunityIntake.ts).
 *
 *   1. Opens each source page (headless Chromium; plain fetch if Chromium is missing)
 *   2. Sends the page TEXT (not raw HTML) to Gemini for structured extraction
 *   3. Sends up to 3 linked PDFs per source straight to Gemini (also handles scanned PDFs)
 *   4. Saves new/changed opportunities as pending drafts (deduplicated)
 *   5. Writes a run summary to Firestore (scraper_runs) and pings the admin
 *      on Telegram if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are set
 *
 * Wiring (unchanged): server.ts calls startScraper(adminDb). The cron fires at
 * 03:00 SAST and POST /api/scraper/run (x-admin-secret header) starts a run.
 *
 * Deployment notes:
 *   - Chromium must exist in the container: `npx playwright install chromium`
 *     in the build step. Without it the scraper falls back to plain fetch,
 *     which only works for pages that are not rendered by JavaScript.
 *   - node-cron only fires while the server process is awake. On hosts that
 *     scale to zero (e.g. Cloud Run, Firebase Functions, Vercel Edge), the
 *     internal cron WILL NOT FIRE — instead set up an external scheduler:
 *       * Cloud Scheduler → POST /api/scraper/run with header x-admin-secret
 *       * cron-job.org    → same target with the same header
 *       * GitHub Actions  → scheduled workflow calling the endpoint
 *     Keep the external schedule at 03:00 SAST (Africa/Johannesburg) so the
 *     scraper runs in the low-traffic window. If the server is a long-lived
 *     process (DigitalOcean App Platform with min-instances=1, Fly.io with
 *     --auto-stop=false, EC2, a Docker container) the internal cron is fine.
 *   - The "Already running — skipping" guard means overlapping external
 *     triggers do nothing. Do not schedule more than once per day.
 *
 * Source URLs go through a public-address check (no private IPs, 10 MB cap,
 * 30 s timeout). DNS rebinding between the check and the fetch is not fully
 * prevented; sources come from a fixed list, so the risk is low.
 *
 * ─── Source list (the file you're most likely to edit) ─────────────────────
 * Each entry should point at a DEEP "funding", "apply" or "programme" page,
 * NOT the institution's home page. Home pages rarely expose the closing
 * date / amount / eligibility — the extractor cannot guess them. Where a
 * funder has more than one fund, list each fund on its own line so the
 * extractor sees one focused page per fund.
 */

import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import cron from 'node-cron';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, MAX_FILE_BYTES, MAX_TEXT_CHARS, createDraft, extractOpportunities, notifyAdmin } from './opportunityIntake';
import type { DraftOutcome } from './opportunityIntake';

// ─── Institution source URLs ─────────────────────────────────────────────────
// Verified deep links — the scraper gets much better yield from "funding" /
// "apply" / "programme" pages than from home pages. When you add a funder,
// link to the page that actually describes the fund's amount, closing date
// and eligibility, not the corporate landing page.
export const INSTITUTION_URLS: { name: string; url: string }[] = [
  // ── National government & DFI ──────────────────────────────────────────
  { name: 'NYDA Grant Programme',          url: 'https://www.nyda.gov.za/Products-Services/NYDA-Grant-Programme' },
  { name: 'TIA Seed Fund',                  url: 'https://www.tia.org.za/seed-fund/' },
  { name: 'SEFA Direct Lending',            url: 'https://www.sefa.org.za/products/direct-lending' },
  { name: 'NEF iMbewu Fund',                 url: 'https://www.nefcorp.co.za/imbewu-fund/' },
  { name: 'IDC Funding Programmes',         url: 'https://www.idc.co.za/funding/' },
  { name: 'IDC Apply for Funding',          url: 'https://www.idc.co.za/apply-for-funding-shortcode-for-all-pages' },
  { name: 'Land Bank Farmer Support',       url: 'https://landbank.co.za/products/' },
  { name: 'DBSA Financing',                  url: 'https://www.dbsa.org/financing' },
  { name: 'SEDFA',                           url: 'https://www.sedfa.org.za/index.html' },

  // ── DTIC incentive scheme pages (each is its own fund) ─────────────────
  { name: 'DTIC Financial & Non-Financial Support', url: 'https://www.thedtic.gov.za/financial-and-non-financial-support' },
  { name: 'DTIC Agro-Processing Support Scheme',   url: 'https://www.thedtic.gov.za/financial-and-non-financial-support/incentives/agro-processing-support-scheme' },
  { name: 'DTIC Seda Technology Programme',         url: 'https://www.thedtic.gov.za/financial-and-non-financial-support/incentives/seda-technology-programme' },
  { name: 'DTIC IDC Development Funds',               url: 'https://www.thedtic.gov.za/financial-and-non-financial-support/incentives/industrial-development-corporation' },

  // ── Seda (national small-business advisory) ───────────────────────────
  { name: 'Seda Small Business Support',     url: 'https://www.seda.org.za/' },
  { name: 'Gov.za Small Business Development', url: 'https://www.gov.za/about-government/small-business-development' },

  // ── Provincial development agencies ───────────────────────────────────
  { name: 'ECDC Funding',                    url: 'https://www.ecdc.co.za/funding' },
  { name: 'GEP Funding Programmes',          url: 'https://www.gep.co.za/funding-programmes' },
  { name: 'Ithala Development Finance',      url: 'https://www.ithala.co.za/business-finance' },
  { name: 'Limpopo LEDA Funding',            url: 'https://www.lieda.co.za/funding' },
  { name: 'NWDC Funding',                    url: 'https://nwdc.co.za/funding' },
  { name: 'Free State FDC Funding',           url: 'https://fdc.co.za/funding' },
  { name: 'MEGA Funding',                     url: 'https://mega.gov.za/funding' },
  { name: 'Casidra Provincial Funding',      url: 'https://www.casidra.co.za/services' },

  // ── KZN Online — the README explicitly mentions this as a missing source.
  // Each KZN fund has its own page; list them separately so the extractor
  // sees one fund per page rather than mixing amounts and dates.
  { name: 'KZN Youth Empowerment Fund',       url: 'https://www.kznonline.gov.za/index.php?option=com_content&view=article&id=306' },
  { name: 'KZN Women Advancement Fund (PDF)', url: 'https://www.kznonline.gov.za/images/Downloads/KZN_Women_Advancement_Fund_Application_Form.pdf' },
  { name: 'KZN Provincial Funding Directory', url: 'https://www.kznonline.gov.za/funding' },

  // ── Private sector & JSE-listed enterprise development programmes ────
  { name: 'Business Partners Ltd',           url: 'https://www.businesspartners.co.za/funding' },
  { name: 'USAID Prosper Africa',             url: 'https://www.prosperafrica.gov/funding-opportunities' },
  { name: 'AECI Bettercare',                  url: 'https://www.aeciworld.com/enterprise-development' },
  { name: 'Aspen Pharmacare ESD',             url: 'https://www.aspenpharma.com/esd' },
  { name: 'Momentum Metropolitan ESD',       url: 'https://www.momentummetropolitan.co.za/about/enterprise-supplier-development' },
  { name: 'Lewis Group ESD',                 url: 'https://www.lewisgroup.co.za/sustainability/enterprise-development' },
  { name: 'Nampak ESD',                      url: 'https://www.nampak.com/sustainability/enterprise-development' },
  { name: 'Standard Bank SME Funding',       url: 'https://www.standardbank.co.za/sme/funding' },
  { name: 'FNB SME Funding',                 url: 'https://www.fnb.co.za/business-banking/funding' },
  { name: 'Nedbank Small Business Services', url: 'https://www.nedbank.co.za/content/nedbankdesktoproot/en/co/business/small-business.html' },
];

// ─── Tunables ────────────────────────────────────────────────────────────────

const PAGE_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 30_000;
const PDFS_PER_SOURCE = 3;
const DELAY_BETWEEN_SOURCES_MS = 5_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; StacFundBot/1.0; funding directory research)';

let adminDb: Firestore | null = null;
let isRunning = false;

// ─── Safe fetching ───────────────────────────────────────────────────────────

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

/** Throws unless the URL is http(s) and every address it resolves to is public. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http(s) URLs are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const literal = net.isIP(host);
  const addresses = literal ? [{ address: host, family: literal }] : await dns.lookup(host, { all: true });
  if (!addresses.length) throw new Error(`could not resolve ${host}`);
  for (const a of addresses) {
    if (a.family === 4 ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address)) throw new Error(`blocked non-public address for ${host}`);
  }
  return url;
}

async function fetchLimited(rawUrl: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string }> {
  await assertPublicHttpUrl(rawUrl);
  const res = await fetch(rawUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await assertPublicHttpUrl(res.url); // a redirect must also end on a public host
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('file too large');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('file too large');
  return { bytes, contentType: res.headers.get('content-type') ?? '' };
}

// ─── Reading pages ───────────────────────────────────────────────────────────

interface PageContent {
  text: string;
  pdfLinks: string[];
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPdfLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+?\.pdf(?:[?#][^"']*)?)["']/gi)) {
    try {
      links.add(new URL(m[1], baseUrl).toString());
    } catch {
      /* ignore malformed link */
    }
  }
  return Array.from(links);
}

async function readWithBrowser(browser: Browser, url: string): Promise<PageContent> {
  await assertPublicHttpUrl(url);
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    const pdfLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => /\.pdf(\?|#|$)/i.test(href))
    );
    return { text, pdfLinks };
  } finally {
    await page.close();
  }
}

async function readWithFetch(url: string): Promise<PageContent> {
  const { bytes } = await fetchLimited(url, MAX_FILE_BYTES);
  const html = bytes.toString('utf8');
  return { text: htmlToText(html), pdfLinks: findPdfLinks(html, url) };
}

// ─── Run bookkeeping ─────────────────────────────────────────────────────────

interface RunStats {
  sources: number;
  pagesRead: number;
  pagesFailed: number;
  pdfsRead: number;
  pdfsFailed: number;
  found: number;
  draftsCreated: number;
  merged: number;
  skipped: number;
  usedBrowser: boolean;
  errors: string[];
}

function newStats(sources: number): RunStats {
  return {
    sources, pagesRead: 0, pagesFailed: 0, pdfsRead: 0, pdfsFailed: 0,
    found: 0, draftsCreated: 0, merged: 0, skipped: 0, usedBrowser: false, errors: [],
  };
}

function noteError(stats: RunStats, message: string): void {
  console.warn(`[Scraper] ${message}`);
  if (stats.errors.length < 15) stats.errors.push(message.slice(0, 300));
}

function tally(stats: RunStats, outcome: DraftOutcome): void {
  if (outcome.outcome === 'created') stats.draftsCreated++;
  else if (outcome.outcome === 'merged') stats.merged++;
  else stats.skipped++;
}

async function saveDrafts(
  stats: RunStats,
  items: Awaited<ReturnType<typeof extractOpportunities>>,
  instName: string,
  sourceUrl: string
): Promise<void> {
  if (!adminDb) return;
  stats.found += items.length;
  for (const extracted of items) {
    try {
      const outcome = await createDraft(adminDb, {
        extracted,
        sourceType: 'scraper',
        sourceName: instName,
        sourceUrl,
        submittedBy: 'scraper',
        origin: 'scraper',
      });
      tally(stats, outcome);
    } catch (e) {
      noteError(stats, `${instName}: could not save a draft (${e instanceof Error ? e.message : String(e)})`);
    }
  }
}

async function processPdf(stats: RunStats, pdfUrl: string, instName: string): Promise<void> {
  try {
    const { bytes } = await fetchLimited(pdfUrl, MAX_FILE_BYTES);
    const items = await extractOpportunities({ kind: 'file', mimeType: 'application/pdf', dataBase64: bytes.toString('base64') });
    stats.pdfsRead++;
    await saveDrafts(stats, items, instName, pdfUrl);
  } catch (e) {
    stats.pdfsFailed++;
    noteError(stats, `${instName}: PDF ${pdfUrl} failed (${e instanceof Error ? e.message : String(e)})`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function runAdvancedScraper(): Promise<void> {
  if (isRunning) {
    console.log('[Scraper] Already running — skipping');
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Scraper] GEMINI_API_KEY not set — skipping');
    return;
  }
  const db = adminDb;
  if (!db) {
    console.warn('[Scraper] No Firestore instance — skipping (nothing could be saved)');
    return;
  }

  isRunning = true;
  const startedAt = new Date();
  const stats = newStats(INSTITUTION_URLS.length);
  console.log(`[Scraper] Starting run for ${stats.sources} sources`);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    stats.usedBrowser = true;
  } catch (e) {
    noteError(stats, `Chromium could not start (${e instanceof Error ? e.message.split('\n')[0] : String(e)}). Falling back to plain fetch.`);
  }

  try {
    for (const inst of INSTITUTION_URLS) {
      try {
        let content: PageContent;
        try {
          content = browser ? await readWithBrowser(browser, inst.url) : await readWithFetch(inst.url);
        } catch (e) {
          if (!browser) throw e;
          content = await readWithFetch(inst.url); // one more try without the browser
        }
        stats.pagesRead++;

        const text = content.text.trim().slice(0, MAX_TEXT_CHARS);
        if (text.length >= 100) {
          const items = await extractOpportunities({ kind: 'text', text });
          await saveDrafts(stats, items, inst.name, inst.url);
        }
        for (const pdfUrl of content.pdfLinks.slice(0, PDFS_PER_SOURCE)) {
          await processPdf(stats, pdfUrl, inst.name);
        }
      } catch (e) {
        stats.pagesFailed++;
        noteError(stats, `${inst.name}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SOURCES_MS));
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    isRunning = false;
  }

  const finishedAt = new Date();
  try {
    await db.collection(COLLECTIONS.SCRAPER_RUNS).doc(startedAt.toISOString()).set({
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      ...stats,
    });
  } catch (e) {
    console.warn('[Scraper] Could not write the run summary:', e);
  }

  const summary =
    `StacFund scraper finished: ${stats.pagesRead}/${stats.sources} pages read, ${stats.pdfsRead} PDFs read, ` +
    `${stats.draftsCreated} new drafts to review, ${stats.skipped} skipped, ${stats.errors.length} problems.`;
  console.log(`[Scraper] ${summary}`);
  if (stats.draftsCreated > 0 || stats.pagesRead === 0 || !stats.usedBrowser) {
    const warning =
      stats.pagesRead === 0
        ? '\nNo pages could be read. Check the server logs.'
        : !stats.usedBrowser
          ? '\nChromium was not available, so JavaScript-heavy pages were skipped.'
          : '';
    await notifyAdmin(summary + warning);
  }
}

/**
 * Initialise the scraper with the Firebase Admin DB and start the daily cron.
 * Call once from server.ts after Firebase Admin is set up.
 */
export function startScraper(db: Firestore | null): void {
  adminDb = db;
  if (!db) console.warn('[Scraper] No Firestore instance — runs will be skipped');

  // Daily at 03:00 SAST
  cron.schedule(
    '0 3 * * *',
    () => {
      console.log('[Scraper] Cron triggered — starting daily run');
      runAdvancedScraper().catch((e) => console.error('[Scraper] Cron run failed:', e));
    },
    { timezone: 'Africa/Johannesburg' }
  );
  console.log('[Scraper] Cron scheduled for 03:00 SAST daily');
}

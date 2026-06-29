#!/usr/bin/env node
/**
 * StacFund Logo Downloader
 * ========================
 * Downloads and stores logos for every funding opportunity in constants.ts.
 *
 * FIX (2026-06-28): The previous version read institutions from
 * `/tmp/institutions.json` and told you to "run the extraction step first" —
 * but no such extraction script was ever delivered, so re-running this was a
 * dead end. This version imports the opportunities straight from
 * `../constants` at runtime, so there's no separate manual step.
 *
 * ASSUMPTION I COULD NOT VERIFY: the import below pulls `MOCK_FUNDING` from
 * `../constants`, because that's the export name `components/AIAssistant.tsx`
 * already uses elsewhere in your project. I don't have your actual
 * constants.ts, so if your real export is named differently, change ONLY
 * the import line marked "ADJUST ME" below — the field-name fallbacks in
 * `normalizeInstitutions()` are written defensively (they try several
 * common field names) so they should keep working even if individual field
 * names differ slightly from what's assumed here.
 *
 * Run with tsx, not plain node, since constants.ts is TypeScript:
 *   npx tsx scripts/download-logos.js              # download all
 *   npx tsx scripts/download-logos.js --force       # re-download even if exists
 *   npx tsx scripts/download-logos.js --monograms   # regenerate monograms only
 *
 * Three-tier strategy per opportunity:
 *   1. Clearbit Logo API (https://logo.clearbit.com/{domain}) — high quality,
 *      transparent PNG, 256x256. Free, no auth, rate limit ~60/min.
 *   2. DuckDuckGo Icons (https://icons.duckduckgo.com/ip3/{domain}.ico) —
 *      fallback when Clearbit returns 404 (smaller orgs).
 *   3. Styled Monogram (generated locally as an SVG) — for the 124
 *      "Private / Government N" placeholders and any domain that fails both
 *      upstream sources.
 *
 * Output:
 *   - public/assets/logos/{opportunity_id}.{png|svg}  (one per opportunity)
 *   - public/assets/logos/manifest.json               (id -> {file, source, status})
 *   - public/assets/logos/hero/                       (curated hero-marquee set)
 *
 * Idempotent: re-running only re-downloads missing/failed entries.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { MOCK_FUNDING } from './constants'; // ADJUST ME if your export is named differently

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname);
const LOGOS_DIR = path.join(ROOT, 'public', 'assets', 'logos');
const HERO_DIR = path.join(LOGOS_DIR, 'hero');
const MANIFEST_PATH = path.join(LOGOS_DIR, 'manifest.json');

// Hero marquee list — these are the institutions we show on the landing page
// for social proof. They get a dedicated folder so the marquee can pull from
// /assets/logos/hero/{slug}.png without hitting Clearbit at runtime.
const HERO_INSTITUTIONS = [
  { slug: 'nyda',   label: 'NYDA',     domain: 'nyda.gov.za' },
  { slug: 'idc',    label: 'IDC',      domain: 'idc.co.za' },
  { slug: 'sefa',   label: 'SEFA',     domain: 'sefa.org.za' },
  { slug: 'nef',    label: 'NEF',      domain: 'nefcorp.co.za' },
  { slug: 'dtic',   label: 'the dtic', domain: 'thedtic.gov.za' },
  { slug: 'seda',   label: 'Seda',     domain: 'seda.org.za' },
  { slug: 'ecdc',   label: 'ECDC',     domain: 'ecdc.co.za' },
  { slug: 'tia',    label: 'TIA',      domain: 'tia.org.za' },
  { slug: 'gep',    label: 'GEP',      domain: 'gep.co.za' },
  { slug: 'fnb',    label: 'FNB',      domain: 'fnb.co.za' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function fetchBuffer(url, { timeout = 8000, maxRedirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'StacFund-LogoDownloader/1.0 (+https://stacfund.africa)',
        'Accept': 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
      timeout,
    }, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location && maxRedirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchBuffer(next, { timeout, maxRedirects: maxRedirects - 1 }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const contentType = res.headers['content-type'] || '';
      if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
        res.resume();
        return reject(new Error(`Not an image (${contentType}) for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`Timeout for ${url}`)); });
  });
}

async function tryDownload(domain) {
  // Tier 1: Clearbit
  try {
    const { buffer } = await fetchBuffer(`https://logo.clearbit.com/${domain}`);
    if (buffer && buffer.length > 500) {  // 500 bytes rules out empty/transparent 1x1
      return { buffer, source: 'clearbit' };
    }
  } catch (e) { /* fall through */ }

  // Tier 2: DuckDuckGo
  try {
    const { buffer } = await fetchBuffer(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    if (buffer && buffer.length > 500) {
      return { buffer, source: 'duckduckgo' };
    }
  } catch (e) { /* fall through */ }

  return null;
}

// Minimal monogram generator (no external deps). Generates a 256x256 SVG
// with a colored gradient background and the institution's initials in
// white, centered. Used as the final fallback for the 124 placeholder
// institutions and any failed downloads. Browsers render SVGs fine even
// inside <img> tags, so we don't need a rasterizer like node-canvas/sharp.
function generateMonogramSvg(initials, seed) {
  const palette = [
    ['#8b5cf6', '#3b82f6'],  // purple-blue
    ['#ec4899', '#8b5cf6'],  // pink-purple
    ['#f97316', '#ec4899'],  // orange-pink
    ['#10b981', '#3b82f6'],  // emerald-blue
    ['#f59e0b', '#ef4444'],  // amber-red
    ['#06b6d4', '#3b82f6'],  // cyan-blue
    ['#a855f7', '#ec4899'],  // purple-pink
    ['#14b8a6', '#06b6d4'],  // teal-cyan
  ];
  const [c1, c2] = palette[seed % palette.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#g)"/>
  <text x="128" y="128" font-family="Inter, system-ui, sans-serif" font-size="96" font-weight="900" fill="white" text-anchor="middle" dominant-baseline="central" letter-spacing="-4">${initials}</text>
</svg>`;

  return { buffer: Buffer.from(svg, 'utf8'), source: 'monogram', isSvg: true };
}

function getInitials(issuer) {
  // Strip parenthetical, "Private / Government N", and take first letters
  const cleaned = issuer.replace(/\([^)]*\)/g, '').replace(/Private\s*\/\s*Government\s*\d+/i, 'PG').trim();
  const words = cleaned.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Normalize institutions from constants.ts ─────────────────────────────
// Defensive field-name fallbacks: tries opportunity_id/id, issuer_name/
// provider/issuer, and source_url/application_url/sourceUrl/applicationUrl,
// since the exact shape of MOCK_FUNDING wasn't available when this was
// written. If none of the id fallbacks match your real field name, every
// item will be skipped and you'll see a warning below — in that case, add
// your actual field name to the `id` fallback chain.
function normalizeInstitutions(raw) {
  const out = [];
  let skipped = 0;
  for (const item of raw) {
    const id = item.opportunity_id || item.id;
    if (!id) { skipped++; continue; }
    const issuer = item.issuer_name || item.provider || item.issuer || 'Unknown Institution';
    const rawUrl = item.source_url || item.application_url || item.sourceUrl || item.applicationUrl || null;
    let domain = null;
    if (rawUrl) {
      try { domain = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { /* ignore malformed urls */ }
    }
    out.push({ id: String(id), issuer, domain });
  }
  if (skipped > 0) {
    console.warn(`[download-logos] Skipped ${skipped} item(s) with no recognizable id field. Check the id fallback chain in normalizeInstitutions().`);
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const monogramsOnly = args.includes('--monograms');

  // Ensure dirs
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  fs.mkdirSync(HERO_DIR, { recursive: true });

  if (!Array.isArray(MOCK_FUNDING) || MOCK_FUNDING.length === 0) {
    console.error('No opportunities found. Check the `MOCK_FUNDING` import at the top of this file matches your real constants.ts export.');
    process.exit(1);
  }

  const institutions = normalizeInstitutions(MOCK_FUNDING);
  console.log(`Loaded ${institutions.length} institutions from constants.ts`);

  // Load existing manifest (if any) for idempotency
  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch {}
  }

  const stats = { downloaded: 0, cached: 0, monogram: 0, failed: 0 };

  for (const inst of institutions) {
    const { id, issuer, domain } = inst;

    // Idempotency check
    if (!force && !monogramsOnly && manifest[id]?.status === 'ok' && fs.existsSync(path.join(LOGOS_DIR, manifest[id].file))) {
      stats.cached++;
      continue;
    }

    if (monogramsOnly && !domain) {
      // Regenerate monograms only
    } else if (monogramsOnly) {
      continue;
    }

    let result = null;
    let source = null;
    let isSvg = false;

    if (domain && !monogramsOnly) {
      // Small delay to be polite to Clearbit
      await sleep(100);
      const dl = await tryDownload(domain);
      if (dl) {
        result = dl.buffer;
        source = dl.source;
      }
    }

    if (!result) {
      // Monogram fallback
      const mono = generateMonogramSvg(getInitials(issuer), id.length + id.charCodeAt(0));
      result = mono.buffer;
      source = mono.source;
      isSvg = mono.isSvg;
      stats.monogram++;
    } else {
      stats.downloaded++;
    }

    const finalExt = isSvg ? 'svg' : 'png';
    const finalPath = path.join(LOGOS_DIR, `${id}.${finalExt}`);
    fs.writeFileSync(finalPath, result);

    manifest[id] = {
      file: `${id}.${finalExt}`,
      source,
      status: 'ok',
      isSvg,
      issuer,
      domain: domain || null,
      generatedAt: new Date().toISOString(),
    };

    // Progress
    const tag = isSvg ? 'MONO' : source.toUpperCase().padEnd(8);
    console.log(`[${tag}] ${id.padEnd(30)} ${issuer.substring(0, 50).padEnd(50)} ${domain || '(no domain)'}`);
  }

  // ─── Build hero marquee set ────────────────────────────────────────────
  console.log('\n--- Building hero marquee set ---');
  for (const hero of HERO_INSTITUTIONS) {
    const heroPath = path.join(HERO_DIR, `${hero.slug}.png`);
    if (!force && fs.existsSync(heroPath)) {
      console.log(`[CACHED ] hero/${hero.slug}.png`);
      continue;
    }
    const dl = await tryDownload(hero.domain);
    if (dl) {
      fs.writeFileSync(heroPath, dl.buffer);
      console.log(`[${dl.source.toUpperCase().padEnd(8)}] hero/${hero.slug}.png`);
    } else {
      // Monogram fallback for hero too
      const mono = generateMonogramSvg(hero.label.substring(0, 2).toUpperCase(), hero.slug.length);
      fs.writeFileSync(path.join(HERO_DIR, `${hero.slug}.svg`), mono.buffer);
      console.log(`[MONO    ] hero/${hero.slug}.svg (Clearbit failed for ${hero.domain})`);
    }
    await sleep(100);
  }

  // Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log('\n=== Summary ===');
  console.log(`Total institutions: ${institutions.length}`);
  console.log(`Downloaded (Clearbit/DuckDuckGo): ${stats.downloaded}`);
  console.log(`Monograms generated: ${stats.monogram}`);
  console.log(`Cached (skipped): ${stats.cached}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Manifest written to: ${MANIFEST_PATH}`);
  console.log(`Hero set written to: ${HERO_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

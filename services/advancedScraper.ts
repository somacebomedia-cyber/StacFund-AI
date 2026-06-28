import { chromium } from 'playwright';
// @ts-expect-error Types for pdf-parse don't define a default export
import pdfParse from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import { db } from './firebase';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import cron from 'node-cron';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
const INSTITUTION_URLS = [
  { name: 'NYDA', url: 'https://www.nyda.gov.co.za/news/Pages/default.aspx' },
  { name: 'IDC', url: 'https://www.idc.co.za/funding/' },
  // Add all 150 institutions
];

async function scrapeDynamicSite(url: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const pdfLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => (a as HTMLAnchorElement).href).filter(href => href.endsWith('.pdf')));
    return { html, pdfLinks };
  } catch (e) { return { html: '', pdfLinks: [] }; } finally { await browser.close(); }
}

async function downloadAndParsePdf(pdfUrl: string) {
  try {
    const res = await fetch(pdfUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    return (await pdfParse(buf)).text.substring(0, 15000);
  } catch { return ''; }
}

async function extractOpportunities(text: string, instName: string) {
  if (!text.trim()) return [];
  const prompt = `Extract funding opportunities from this text from ${instName}. Return ONLY JSON array. Schema: [{"programme_name":"string","funding_type":"GRANT|LOAN|EQUITY","amount_min":0,"amount_max":0,"closing_date":"YYYY-MM-DD","status":"OPEN","eligibility_summary":"string"}]`;
  const res = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: `${prompt}\n\nCONTENT:\n${text}`, config: { responseMimeType: 'application/json' } });
  return JSON.parse(res.text || '[]');
}

export async function runAdvancedScraper() {
  for (const inst of INSTITUTION_URLS) {
    const { html, pdfLinks } = await scrapeDynamicSite(inst.url);
    await saveAndNotify(await extractOpportunities(html, inst.name), inst.name);
    for (const pdf of pdfLinks) await saveAndNotify(await extractOpportunities(await downloadAndParsePdf(pdf), inst.name), inst.name);
    await new Promise(r => setTimeout(r, 10000));
  }
}

async function saveAndNotify(opps: any[], instName: string) {
  for (const opp of opps) {
    const q = query(collection(db, 'funding_opportunities'), where('programme_name', '==', opp.programme_name));
    if (!(await getDocs(q)).empty) continue;
    await addDoc(collection(db, 'funding_opportunities'), { ...opp, issuer_name: instName, last_verified_at: new Date().toISOString() });
    // Add user matching logic here
  }
}

// Schedule daily at 3 AM
cron.schedule('0 3 * * *', runAdvancedScraper);

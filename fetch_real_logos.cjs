const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const urls = {
  nyda: 'https://nyda.gov.za/',
  idc: 'https://www.idc.co.za/',
  sefa: 'https://www.sefa.org.za/',
  nef: 'https://www.nefcorp.co.za/',
  dtic: 'https://www.thedtic.gov.za/',
  seda: 'http://www.seda.org.za/',
  ecdc: 'https://www.ecdc.co.za/',
  tia: 'https://www.tia.org.za/',
  gep: 'https://www.gep.co.za/',
  fnb: 'https://www.fnb.co.za/'
};

async function fetchHTML(urlStr) {
  return new Promise((resolve, reject) => {
    const lib = urlStr.startsWith('https') ? https : http;
    const req = lib.get(urlStr, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHTML(new URL(res.headers.location, urlStr).href).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractLogoUrl(html, base) {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  let best = null;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.toLowerCase().includes('logo') || src.toLowerCase().includes('brand')) {
      if (src.endsWith('.svg') || src.endsWith('.png') || src.endsWith('.jpg') || src.endsWith('.jpeg')) {
        best = new URL(src, base).href;
        if (src.endsWith('.svg') || src.endsWith('.png')) break; // Prefer svg or png
      }
    }
  }
  return best;
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(new URL(res.headers.location, url).href, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    });
    req.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function run() {
  for (const [name, url] of Object.entries(urls)) {
    try {
      console.log(`Fetching ${name} from ${url}...`);
      const html = await fetchHTML(url);
      const logoUrl = extractLogoUrl(html, url);
      if (logoUrl) {
        console.log(`Found logo for ${name}: ${logoUrl}`);
        const ext = logoUrl.split('.').pop().split('?')[0].toLowerCase() || 'png';
        const dest = path.join(__dirname, 'public/assets/logos/hero', `${name}.${ext}`);
        await downloadFile(logoUrl, dest);
        console.log(`Saved to ${dest}`);
        // clean up old svg if downloaded png, etc.
        if (ext !== 'svg' && fs.existsSync(path.join(__dirname, 'public/assets/logos/hero', `${name}.svg`))) {
           fs.unlinkSync(path.join(__dirname, 'public/assets/logos/hero', `${name}.svg`));
        }
      } else {
        console.log(`No logo found for ${name}`);
      }
    } catch (e) {
      console.error(`Error processing ${name}: ${e.message}`);
    }
  }
}

run();

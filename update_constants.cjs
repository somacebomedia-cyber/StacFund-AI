const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('public/assets/logos/manifest.json', 'utf8'));

let content = fs.readFileSync('constants.ts', 'utf8');

const regex = /opportunity_id:\s*"([^"]+)"([\s\S]*?)confidence_score:\s*\d+,?\s*}/g;
let updatedContent = content.replace(regex, (match, id) => {
  if (manifest[id]) {
    const logoUrl = `/assets/logos/${manifest[id].file}`;
    if (match.includes('logo_url:')) {
      return match.replace(/logo_url:\s*"[^"]*",?/, `logo_url: "${logoUrl}",`);
    } else {
      return match.replace(/source_url:/, `logo_url: "${logoUrl}",\n    source_url:`);
    }
  }
  return match;
});

fs.writeFileSync('constants.ts', updatedContent);

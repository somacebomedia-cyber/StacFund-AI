const fs = require('fs');

const realUrls = {
  nyda: 'https://www.nyda.gov.za/Portals/0/logonew.fw6859.png',
  idc: 'https://www.idc.co.za/wp-content/uploads/2018/06/idc-logo-400.png',
  sefa: 'https://www.sefa.org.za/content/images/sefa-logo.png',
  nef: 'https://www.nefcorp.co.za/wp-content/uploads/2018/04/NEF_Logo_2018.png',
  dtic: 'https://www.thedtic.gov.za/wp-content/uploads/2019/12/dtic_logo.jpg',
  seda: 'https://seda.org.za/wp-content/uploads/2023/11/seda_logo_1.png',
  ecdc: 'https://static.wixstatic.com/media/ee01a9_fc5abf752f5f4840b3b8a8b4c79e2a03~mv2.png',
  tia: 'https://www.tia.org.za/storage/2023/12/tia-logo-1.png',
  gep: 'https://www.gep.co.za/wp-content/uploads/2019/03/gep-logo-square2.png',
  fnb: 'https://www.fnb.co.za/assets/images/fnb-logo.svg',
  dbsa: 'https://www.dbsa.org/themes/custom/dbsa/logo.svg',
  dsbd: 'https://www.dsbd.gov.za/sites/default/files/2021-08/dsbd-logo.png',
  bp: 'https://www.bp.com/etc/designs/bp-dot-com/assets/images/logo.svg',
  awethu: 'https://awethuproject.co.za/wp-content/uploads/2020/09/awethu-logo-2020.png',
  isizwe: 'https://projectisizwe.org/wp-content/uploads/2019/01/isizwe-logo-300x95.png',
  wcf: 'https://www.wesgro.co.za/assets/images/wesgro-logo.svg',
  sars: 'https://www.sars.gov.za/wp-content/uploads/2021/03/SARS-Logo-2020.png',
  cipc: 'https://www.cipc.co.za/wp-content/uploads/2022/01/CIPC-logo-2022.png',
  'department of agriculture': 'https://www.dalrrd.gov.za/wp-content/uploads/2021/04/dalrrd-logo.png',
  'gauteng enterprise': 'https://www.gep.co.za/wp-content/uploads/2019/03/gep-logo-square2.png'
};

let constantsContent = fs.readFileSync('constants.ts', 'utf8');

// Match logo_url: "..." and replace based on issuer_name or provider or source_url
let replacements = 0;

constantsContent = constantsContent.replace(/(issuer_name|issuer|provider):\s*["']([^"']+)["'][^}]*?logo_url:\s*["']([^"']+)["']/gs, (match, key, issuerName, oldUrl) => {
    let lowerIssuer = issuerName.toLowerCase();
    let newUrl = oldUrl;

    for (const [keyName, realUrl] of Object.entries(realUrls)) {
        if (lowerIssuer.includes(keyName)) {
            newUrl = realUrl;
            break;
        }
    }

    // fallback to google favicons if not found
    if (newUrl === oldUrl) {
       // try to extract domain from source_url
       let sourceMatch = match.match(/source_url:\s*["']([^"']+)["']/);
       if(sourceMatch) {
          try {
             let domain = new URL(sourceMatch[1]).hostname;
             newUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
          } catch(e) {}
       }
    }

    if (newUrl !== oldUrl) {
        replacements++;
        return match.replace(oldUrl, newUrl);
    }
    return match;
});

// Since the regex above might not catch all due to spacing/ordering, let's also do a simpler pass:
let MOCK_FUNDING_start = constantsContent.indexOf('export const MOCK_FUNDING');
// just parse the whole array if needed... actually, regex is fine if we make it simpler:

let lines = constantsContent.split('\n');
let currentIssuer = '';
let currentSource = '';
for(let i=0; i<lines.length; i++) {
    if (lines[i].includes('issuer_name:')) currentIssuer = lines[i].split(/["']/)[1] || '';
    if (lines[i].includes('provider:')) currentIssuer = lines[i].split(/["']/)[1] || '';
    if (lines[i].includes('source_url:')) currentSource = lines[i].split(/["']/)[1] || '';
    if (lines[i].includes('application_url:')) currentSource = lines[i].split(/["']/)[1] || '';
    
    if (lines[i].includes('logo_url:')) {
        let oldUrl = lines[i].split(/["']/)[1];
        if (oldUrl && oldUrl.startsWith('/assets/logos/')) {
            let newUrl = oldUrl;
            let lowerIssuer = currentIssuer.toLowerCase();
            let found = false;
            for (const [keyName, realUrl] of Object.entries(realUrls)) {
                if (lowerIssuer.includes(keyName)) {
                    newUrl = realUrl;
                    found = true;
                    break;
                }
            }
            if (!found && currentSource) {
                try {
                    let domain = new URL(currentSource).hostname;
                    newUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                } catch(e) {}
            }
            lines[i] = lines[i].replace(oldUrl, newUrl);
            replacements++;
        }
    }
}

fs.writeFileSync('constants.ts', lines.join('\n'));
console.log(`Replaced ${replacements} logo URLs in constants.ts`);

const fs = require('fs');

let profile = fs.readFileSync('pages/ProfileForm.tsx', 'utf8');

const schemaStart = profile.indexOf('const fullBusinessPlanSchemaProperties = {');
const schemaEnd = profile.indexOf('const allPrompts = [');
const schemaStr = profile.substring(schemaStart, schemaEnd);

const loopStart = profile.indexOf('const allPrompts = [');
const loopEnd = profile.indexOf('setGeneratedBusinessPlanData(mergedData);') + 'setGeneratedBusinessPlanData(mergedData);'.length;
let loopStr = profile.substring(loopStart, loopEnd);

// Modify loopStr for FundingNeedsTracker
loopStr = loopStr.replace(/config\.premiumOutput \? 'PREMIUM, INVESTOR-GRADE' : 'standard'/g, "'PREMIUM, INVESTOR-GRADE'");
loopStr = loopStr.replace(/config\.premiumOutput \? 'PREMIUM MODE: Match the depth of a 95-page consulting-grade document\. Each section must be exhaustive\.' : 'Write comprehensively enough to fill at least 2 A4 pages per section\.'/g, "'PREMIUM MODE: Match the depth of a 95-page consulting-grade document. Each section must be exhaustive.'");
loopStr = loopStr.replace(/config\.premiumOutput \? 32768 : 16384/g, "32768");
loopStr = loopStr.replace(/setBatchProgress\([^\)]+\);/g, "");

// adjust the business identity injection to use the funding needs tracker's versions
loopStr = loopStr.replace(/BUSINESS IDENTITY:([^]+?)FINANCIAL/m, `BUSINESS IDENTITY:
- Business Name: \${businessInfo?.name || user.businessName}
- Industry: \${businessInfo?.industry || 'General Services'}
- Business Type: Private Company
- Description: \${businessInfo?.description || 'A growing South African enterprise.'}
- Products & Services: Standard industry offerings.
- Years in Operation: Early stage
- Current Employees: Lean founding team
- Current Revenue: Pre-revenue / early revenue
- B2B Connections: Building pipeline
FINANCIAL`);

loopStr = loopStr.replace(/DOCUMENT CONTEXT: \${financialDocs[^}]+}/, `DOCUMENT CONTEXT: \${financialDocs || 'None uploaded — use realistic SA industry benchmarks'}`);

// adjust setGeneratedBusinessPlanData(mergedData) to add docType text based on the item
loopStr = loopStr.replace(/setGeneratedBusinessPlanData\(mergedData\);/, "setGeneratedBusinessPlanData({ ...mergedData, docType: type === 'businessplan' ? `Business Plan: ${need.itemName}` : `Funding Proposal: ${need.itemName}` });");


let funding = fs.readFileSync('components/FundingNeedsTracker.tsx', 'utf8');

const tryStart = funding.indexOf('    try {\n      const ai = new GoogleGenAI');
const tryEnd = funding.indexOf('    } catch (e) {\n      console.error(e);\n      alert(\'Generation failed. Check your connection.\');');

const newTryBlock = `    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let totalBatches = 5;
      const cleanedAmount = need.estimatedCost;
      if (cleanedAmount < 10000) totalBatches = 2;
      else if (cleanedAmount >= 10000 && cleanedAmount < 50000) totalBatches = 3;

      ${schemaStr}
      ${loopStr}
`;

funding = funding.substring(0, tryStart) + newTryBlock + funding.substring(tryEnd);

fs.writeFileSync('components/FundingNeedsTracker.tsx', funding);

console.log("Updated components/FundingNeedsTracker.tsx successfully!");

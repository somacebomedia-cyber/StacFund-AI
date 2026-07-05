const fs = require('fs');

const filesToFix = [
  'components/AIAssistant.tsx',
  'components/AdvertGenerator.tsx',
  'components/AILogoGenerator.tsx',
  'components/FormDigitizer.tsx',
  'components/FundingNeedsTracker.tsx',
  'components/WhatsAppIngestion.tsx',
  'components/PresentationDesigner.tsx',
  'services/advancedScraper.ts',
  'pages/Dashboard.tsx'
];

for (const file of filesToFix) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf-8');
  
  if (content.includes('new GoogleGenAI')) {
    content = content.replace(/new GoogleGenAI\(\{ apiKey:[^\}]+\}\)/g, 'await createGeminiClient()');
    
    // Add import if not present
    if (!content.includes('createGeminiClient')) {
      const depth = file.split('/').length - 1;
      const prefix = depth === 1 ? '../' : '../../'; // assuming all in one subfolder level
      const importPath = file.startsWith('services') ? './geminiClient' : (file.startsWith('pages') ? '../services/geminiClient' : '../services/geminiClient');
      
      content = content.replace(/(import .* from '@google\/genai';?)/, `$1\nimport { createGeminiClient } from '${importPath}';`);
    }
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
}

const fs = require('fs');

const filesToFix = [
  'components/AdvertGenerator.tsx',
  'components/AILogoGenerator.tsx',
  'components/FormDigitizer.tsx',
  'components/FundingNeedsTracker.tsx',
  'components/WhatsAppIngestion.tsx',
  'components/PresentationDesigner.tsx'
];

for (const file of filesToFix) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf-8');
  
  if (content.includes('new GoogleGenAI')) {
    content = content.replace(/new GoogleGenAI\([^)]+\)\);/g, 'await createGeminiClient();');
    content = content.replace(/new GoogleGenAI\(\{[\s\S]*?\}\);/g, 'await createGeminiClient();');
    content = content.replace(/new GoogleGenAI\([^\)]*\);?/g, 'await createGeminiClient();');
    
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
}

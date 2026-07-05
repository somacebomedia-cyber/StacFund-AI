const fs = require('fs');

const filesToFix = [
  'components/AIAssistant.tsx',
  'pages/ProfileForm.tsx',
  'pages/Dashboard.tsx'
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

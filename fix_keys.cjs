const fs = require('fs');
const path = require('path');

const files = [
  'components/AIAssistant.tsx',
  'components/AILogoGenerator.tsx',
  'components/PresentationDesigner.tsx',
  'components/ApplicationWorkflow.tsx',
  'components/FormDigitizer.tsx',
  'components/AdvertGenerator.tsx',
  'pages/Marketplace.tsx',
  'pages/ProfileForm.tsx',
  'pages/Dashboard.tsx'
];

files.forEach(file => {
  const filepath = path.join(__dirname, file);
  if (fs.existsSync(filepath)) {
    let content = fs.readFileSync(filepath, 'utf8');
    content = content.replace(/process\.env\.API_KEY/g, 'process.env.GEMINI_API_KEY');
    fs.writeFileSync(filepath, content);
    console.log(`Updated ${file}`);
  }
});

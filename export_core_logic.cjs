const fs = require('fs');
const path = require('path');

const filesToExport = [
  'server.ts',
  'services/matchingEngine.ts',
  'constants.ts',
  'components/BusinessPlanDocument.tsx',
  'components/PitchDeckDocument.tsx',
  'components/PresentationDesigner.tsx',
  'components/ApplicationWorkflow.tsx',
  'fetch_img.cjs',
  'fetch_logos.cjs'
];

let outputContent = '';

for (const file of filesToExport) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    outputContent += `\n\n================================================================================\n`;
    outputContent += `FILE: ${file}\n`;
    outputContent += `================================================================================\n\n`;
    outputContent += content;
  } else {
    outputContent += `\n\n================================================================================\n`;
    outputContent += `FILE: ${file} (NOT FOUND)\n`;
    outputContent += `================================================================================\n\n`;
  }
}

fs.writeFileSync(path.join(__dirname, 'core_logic_export.txt'), outputContent);
console.log('Export complete: core_logic_export.txt');

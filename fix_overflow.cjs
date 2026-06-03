const fs = require('fs');
let content = fs.readFileSync('components/BusinessPlanDocument.tsx', 'utf8');
content = content.replace(/min-h-\[297mm\] p-16 bg-\[#05050A\] page-break flex flex-col overflow-hidden/g, 'min-h-[297mm] p-16 bg-[#05050A] page-break flex flex-col');
content = content.replace(/min-h-\[297mm\] p-16 bg-white page-break flex flex-col overflow-hidden/g, 'min-h-[297mm] p-16 bg-white page-break flex flex-col');
fs.writeFileSync('components/BusinessPlanDocument.tsx', content);

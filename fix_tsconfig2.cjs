const fs = require('fs');
let tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf-8'));
tsconfig.compilerOptions.esModuleInterop = true;
tsconfig.compilerOptions.allowSyntheticDefaultImports = true;
fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));

const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf-8');

// Add trust proxy
if (!content.includes("app.set('trust proxy', 1)")) {
  content = content.replace("const app = express();", "const app = express();\n  app.set('trust proxy', 1);");
}

// Remove Authorization header from proxyReq
if (!content.includes("proxyReq.removeHeader('Authorization');")) {
  content = content.replace(
    "if (process.env.GEMINI_API_KEY) {", 
    "proxyReq.removeHeader('Authorization');\n          if (process.env.GEMINI_API_KEY) {"
  );
}

fs.writeFileSync('server.ts', content);

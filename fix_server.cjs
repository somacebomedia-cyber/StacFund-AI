const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf-8');

// Add import
if (!content.includes('express-rate-limit')) {
    content = content.replace('import express from "express";', 'import express from "express";\nimport rateLimit from "express-rate-limit";');
}

// Add requireAuth
const requireAuth = `
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!adminAuth) {
    return res.status(500).json({ error: "Firebase Admin not configured" });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

const geminiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const paystackLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
`;

if (!content.includes('const requireAuth')) {
    content = content.replace('async function startServer() {', requireAuth + '\nasync function startServer() {');
}

// apply requireAuth and rate limits
content = content.replace("app.use(\n    '/api/gemini',", "app.use(\n    '/api/gemini',\n    requireAuth,\n    geminiLimiter,");
content = content.replace('app.post("/api/paystack/initialize", async (req, res) => {', 'app.post("/api/paystack/initialize", requireAuth, paystackLimiter, async (req, res) => {');
content = content.replace('app.post("/api/paystack/verify", async (req, res) => {', 'app.post("/api/paystack/verify", requireAuth, paystackLimiter, async (req, res) => {');
content = content.replace('app.post("/api/presenton/generate", async (req, res) => {', 'app.post("/api/presenton/generate", requireAuth, async (req, res) => {');

// Paystack verify now checks paid amount
content = content.replace(
  'const { reference, userId, plan } = req.body;', 
  'const { reference, plan } = req.body;\n      const userId = (req as any).user.uid;'
);

content = content.replace(
  'const plan = metadata.plan;',
  `const plan = metadata.plan;
      const expectedAmount = plan === 'premium' ? 499000 : 0;
      if (response.data.data.amount < expectedAmount) {
         return res.status(400).json({ error: "Paid amount does not match expected plan price" });
      }`
);

// /api/scraper/run requires an x-admin-secret header
content = content.replace('app.post("/api/scraper/run", async (req, res) => {', 'app.post("/api/scraper/run", async (req, res) => {\n    const adminSecret = req.headers["x-admin-secret"];\n    if (!adminSecret || adminSecret !== process.env.ADMIN_API_SECRET) {\n      return res.status(401).json({ error: "Unauthorized" });\n    }');

fs.writeFileSync('server.ts', content);

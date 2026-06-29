import express from "express";
import path from "path";
import axios from "axios";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createProxyMiddleware } from 'http-proxy-middleware';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import fs from 'fs';
import { startScraper, runAdvancedScraper } from './services/advancedScraper';

// Initialize Firebase Admin
let db: FirebaseFirestore.Firestore | null = null;
let adminAuth: Auth | null = null;
try {
  const serviceAccountKeyStr = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let config: any = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  if (serviceAccountKeyStr) {
    const serviceAccount = JSON.parse(serviceAccountKeyStr);
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: config.projectId || serviceAccount.project_id
    });
    db = getFirestore(app, config.firestoreDatabaseId || '(default)');
    adminAuth = getAuth(app);
    console.log("Firebase Admin SDK initialized successfully.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not set. The backend will not be able to securely update Firestore subscriptions, and token-verified routes (e.g. /api/presenton/generate) will reject all requests.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK:", error);
}

// ─── SSRF protection helpers ────────────────────────────────────────────────
// FIX (2026-06-28): The previous version only checked the *literal* hostname
// against an IP regex/blocklist, then let axios follow redirects with a
// validateStatus check that didn't actually re-inspect the destination host.
// That's vulnerable to DNS rebinding: a hostname can resolve to a public IP
// the moment we check it, then to an internal IP by the time the request
// actually connects (or a redirect can point straight at an internal host).
//
// The real fix is to validate the IP at the point of TCP connection, not just
// once up front. We do that with a custom `lookup` function passed into a
// dedicated http/https Agent — every connection this agent makes (including
// ones from automatic redirect-following) goes through this check.
//
// This blocklist is pragmatic, not exhaustive — for example it won't catch
// every obscure IP-literal encoding. It's meaningfully better than before,
// but if /api/brand-sync ever needs to be hardened further, the gold
// standard is an allowlist of known-safe domains rather than a blocklist.

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||                  // loopback
    (a === 169 && b === 254) ||   // link-local / cloud metadata (169.254.169.254)
    a === 0 ||                    // "this network"
    a >= 224                      // multicast + reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;          // loopback / unspecified
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]); // IPv4-mapped IPv6
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP at all — fail closed
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'ip6-localhost', 'metadata.google.internal',
]);

/**
 * Custom DNS lookup enforced at the actual connection step. Used as the
 * `lookup` option on the http/https Agent so every connection this agent
 * makes — including ones axios's redirect-follower opens for you — gets
 * re-validated, not just the first hostname you typed in.
 */
function safeLookup(hostname: string, options: any, callback: any) {
  const opts = typeof options === 'function' ? {} : options;
  const cb = typeof options === 'function' ? options : callback;

  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return cb(err, null as any, null as any);
    const list = Array.isArray(addresses) ? addresses : [addresses as any];
    const blocked = list.find((a: any) => isBlockedIp(a.address));
    if (blocked) {
      return cb(new Error(`Blocked host: ${hostname} resolves to a private/internal address (${blocked.address})`), null as any, null as any);
    }
    if (opts?.all) {
      return cb(null, list as any, (list[0]?.family || 4) as any);
    }
    cb(null, list[0].address, list[0].family);
  });
}

const safeHttpAgent = new http.Agent({ lookup: safeLookup as any });
const safeHttpsAgent = new https.Agent({ lookup: safeLookup as any });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize the funding scraper (daily cron + manual trigger endpoint).
  // Runs after Firebase Admin is set up so the scraper can write to Firestore.
  startScraper(db);

  // Proxy for Gemini API
  app.use(
    '/api/gemini',
    createProxyMiddleware({
      target: 'https://generativelanguage.googleapis.com',
      changeOrigin: true,
      pathRewrite: (path) => {
        // Remove base path and strip key parameter if present
        let newPath = path.replace(/^\/api\/gemini/, '');
        if (newPath.includes('key=')) {
          newPath = newPath.replace(/[?&]key=[^&]+/, '');
          // Fix hanging ? if it's the only param
          newPath = newPath.replace(/\?$/, '');
        }
        return newPath;
      },
      on: {
        proxyReq: (proxyReq, req: any) => {
          if (process.env.GEMINI_API_KEY) {
            proxyReq.setHeader('x-goog-api-key', process.env.GEMINI_API_KEY);
          }
          proxyReq.setHeader('user-agent', 'aistudio-build');

          // Re-stream body because express.json() consumed it
          if (req.body && Object.keys(req.body).length > 0) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
      },
    })
  );

  // API route to initialize a Paystack transaction
  app.post("/api/paystack/initialize", async (req, res) => {
    try {
      const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecret) {
        return res.status(500).json({ error: "PAYSTACK_SECRET_KEY environment variable is missing" });
      }

      const { email, amount, metadata } = req.body;

      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        { email, amount, metadata },
        {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
        }
      );

      res.json(response.data);
    } catch (error: any) {
      console.error("Paystack initialize error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to initialize payment", details: error.response?.data });
    }
  });

  // API route to verify a Paystack transaction and securely update subscription
  app.post("/api/paystack/verify", async (req, res) => {
    try {
      const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecret) {
        return res.status(500).json({ error: "PAYSTACK_SECRET_KEY environment variable is missing" });
      }

      const { reference, userId, plan, cycle } = req.body;

      if (!reference || !userId || !plan) {
         return res.status(400).json({ error: "Missing required fields (reference, userId, plan)" });
      }

      // Expected amount lookup — prevents a malicious user from paying R1 and
      // getting a Business Yearly plan (R4,800 value). Amounts in kobo (R1 = 100).
      const PRICING: Record<string, { monthly: number; yearly: number }> = {
        pro: { monthly: 19900, yearly: 199000 },      // R199 / R1,990
        business: { monthly: 49900, yearly: 499000 }, // R499 / R4,990
      };
      const expectedAmount = PRICING[plan]?.[cycle || 'monthly'];
      if (!expectedAmount) {
        return res.status(400).json({ error: `Invalid plan/cycle: ${plan}/${cycle}` });
      }

      const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
          },
        }
      );

      const verificationData = response.data;

      // Ensure the payment was successful
      if (verificationData.status === true && verificationData.data.status === 'success') {
        // CRITICAL: verify the amount paid matches the expected plan price.
        // Paystack returns amount in kobo (smallest ZAR unit).
        const paidAmount = verificationData.data.amount;
        if (paidAmount !== expectedAmount) {
          console.error(`[Paystack] Amount mismatch: expected ${expectedAmount}, got ${paidAmount} for ref ${reference}`);
          return res.status(400).json({
            error: "Amount mismatch — payment does not match expected plan price",
            expected: expectedAmount,
            paid: paidAmount,
          });
        }

        // Securely update the user's subscription in Firestore
        if (db) {
            await db.collection("users").doc(userId).set({
              subscriptionPlan: plan,
              billingCycle: cycle || 'monthly',
              subscriptionUpdatedAt: new Date().toISOString(),
              paystackReference: reference,
            }, { merge: true });
            console.log(`Updated subscription for user ${userId} to ${plan} (${cycle}) — verified R${expectedAmount/100}`);
            res.json({ ...verificationData, firestoreUpdated: true });
         } else {
            console.warn("Payment verified, but Firestore was not updated because Admin SDK is missing.");
            res.json({ ...verificationData, firestoreUpdated: false, warning: "Admin SDK missing" });
         }
      } else {
         res.status(400).json({ error: "Payment verification failed", details: verificationData });
      }
    } catch (error: any) {
      console.error("Paystack verify error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to verify payment", details: error.response?.data });
    }
  });

  // API route for Brand Sync (extract colors/fonts from URL)
  // SECURITY: SSRF-protected. Blocks private/internal IP ranges and metadata
  // endpoints, and — unlike before — re-validates every DNS resolution at
  // the actual connection step via a custom Agent, so a hostname that
  // resolves to a public IP now and a private one a moment later (DNS
  // rebinding) is still blocked, and so is a redirect straight into a
  // private host.
  app.post("/api/brand-sync", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only http/https URLs are allowed" });
      }

      // Fast literal check (handles raw IP literals and obvious local hostnames
      // before we even attempt a DNS lookup).
      const hostname = parsedUrl.hostname.toLowerCase();
      if (BLOCKED_HOSTNAMES.has(hostname) || (net.isIP(hostname) && isBlockedIp(hostname))) {
        return res.status(400).json({ error: "Blocked host" });
      }

      const response = await axios.get(url, {
        timeout: 5000,
        maxContentLength: 1024 * 1024, // 1MB cap
        maxRedirects: 3,
        validateStatus: (s) => s === 200,
        // Every hop — including redirect targets — connects through this
        // agent, which re-resolves and re-checks the destination IP.
        httpAgent: safeHttpAgent,
        httpsAgent: safeHttpsAgent,
      });
      const html = typeof response.data === 'string' ? response.data : '';

      // Basic extraction of colors
      const hexRegex = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})\b/g;
      const matches = html.match(hexRegex) || [];
      const colors = [...new Set(matches)].slice(0, 5); // top 5 colors

      res.json({
        primaryColor: colors[0] || '#4F46E5', // fallback indigo
        secondaryColor: colors[1] || '#06b6d4',
        accentColor: colors[2] || '#a855f7',
        font: 'font-sans'
      });
    } catch (error: any) {
      console.error("Brand sync error:", error.message);
      res.status(500).json({ error: "Failed to sync brand", details: error.message });
    }
  });

  // Presenton API proxy route
  // SECURITY: Requires a real, cryptographically-verified Firebase ID token
  // (not just a non-empty Bearer header), plus caps input size to prevent
  // abuse of the Presenton backend service.
  //
  // FIX (2026-06-28): the previous version only checked that the
  // Authorization header started with "Bearer " — any string would pass,
  // it never actually verified the token. This now calls
  // `adminAuth.verifyIdToken()`, which cryptographically validates the JWT
  // against Firebase. If the Admin SDK isn't configured, we fail CLOSED
  // (reject everything) rather than silently accepting unverified requests.
  app.post("/api/presenton/generate", async (req, res) => {
    try {
      const { businessPlan, template, deckType } = req.body;

      if (!businessPlan) {
        return res.status(400).json({
          error: "businessPlan is required"
        });
      }

      // Cap input at 50k chars to protect the Presenton service
      const MAX_PLAN_LENGTH = 50000;
      if (typeof businessPlan !== 'string' || businessPlan.length > MAX_PLAN_LENGTH) {
        return res.status(400).json({
          error: `businessPlan must be a string under ${MAX_PLAN_LENGTH} chars`,
          receivedLength: typeof businessPlan === 'string' ? businessPlan.length : 'non-string'
        });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const idToken = authHeader.slice('Bearer '.length).trim();

      if (!adminAuth) {
        // We can't cryptographically verify the token without the Admin SDK,
        // so fail closed instead of accepting any non-empty header.
        console.warn('[Presenton] Rejecting request: Firebase Admin Auth is not initialized (FIREBASE_SERVICE_ACCOUNT_KEY missing).');
        return res.status(503).json({ error: "Auth verification unavailable. Set FIREBASE_SERVICE_ACCOUNT_KEY." });
      }

      let uid: string;
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (e: any) {
        console.warn('[Presenton] Token verification failed:', e?.message || e);
        return res.status(401).json({ error: "Invalid or expired authentication token" });
      }

      const presentonUrl = process.env.PRESENTON_URL || "http://localhost:5000";

      const prompt = `
Create a professional investor pitch deck.

Deck Type:
${deckType || "Investor Pitch Deck"}

Use this business plan:

${businessPlan}

Include these slides:

1. Cover
2. Problem
3. Solution
4. Market Opportunity
5. Business Model
6. Funding Request
7. Financial Projections
8. Social Impact
9. Team
10. Closing
`;

      console.log(`[Presenton] Generating deck for verified user ${uid}`);

      const response = await axios.post(
        `${presentonUrl}/api/generate`,
        {
          prompt,
          template: template || "stacfund-template"
        },
        {
          timeout: 120000, // 2 min — Presenton can be slow
          maxContentLength: 10 * 1024 * 1024, // 10MB response cap
        }
      );

      res.json(response.data);

    } catch (error: any) {
      console.error("Presenton generation error:", error.response?.data || error.message);
      res.status(500).json({
        error: "Failed to generate presentation",
        details: error.response?.data
      });
    }
  });

  // Manual scraper trigger — admin-only. Useful for testing or forcing a
  // refresh outside the daily cron schedule. Returns immediately and runs
  // the scraper in the background (can take 10+ minutes for all 37 sites).
  app.post("/api/scraper/run", async (req, res) => {
    // Basic admin check: requires a secret header set in env
    const adminSecret = process.env.ADMIN_API_SECRET;
    if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // Fire-and-forget — don't block the request
    runAdvancedScraper().catch(e => console.error('[Scraper] Manual run failed:', e));
    res.json({ status: 'started', message: 'Scraper running in background' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

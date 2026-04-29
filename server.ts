import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Initialize Firebase Admin
let db: FirebaseFirestore.Firestore | null = null;
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
    console.log("Firebase Admin SDK initialized successfully.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not set. The backend will not be able to securely update Firestore subscriptions.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
         // Optionally verify amount here against expected plan cost
         
         // Securely update the user's subscription in Firestore
         if (db) {
            await db.collection("users").doc(userId).update({
              subscriptionPlan: plan,
              billingCycle: cycle || 'monthly'
            });
            console.log(`Updated subscription for user ${userId} to ${plan}`);
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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

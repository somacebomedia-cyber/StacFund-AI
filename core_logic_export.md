

================================================================================
FILE: server.ts
================================================================================

import express from "express";
import path from "path";
import axios from "axios";
import { createProxyMiddleware } from 'http-proxy-middleware';
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


================================================================================
FILE: services/matchingEngine.ts
================================================================================

import { FundingOpportunityDb, UserBusinessProfile } from '../types';

export interface MatchScore {
  opportunityId: string;
  totalScore: number;
  eligibilityScore: number; // Max 40
  readinessScore: number;   // Max 30
  speedScore: number;       // Max 15
  valueFitScore: number;    // Max 15
  matchReason: string;
}

export function calculateMatch(
  profile: UserBusinessProfile,
  opportunity: FundingOpportunityDb
): MatchScore {
  let eligibilityScore = 0;
  let readinessScore = 0;
  let speedScore = 0;
  let valueFitScore = 0;

  // 1. Eligibility (Max 40)
  const isAnySector = opportunity.sector_tags.length === 0 || opportunity.sector_tags.includes('All') || opportunity.sector_tags.includes('Any');
  if (isAnySector || opportunity.sector_tags.includes(profile.industry)) {
    eligibilityScore += 20;
  }

  const isAnyScope = !opportunity.geo_scope || opportunity.geo_scope === 'National' || opportunity.geo_scope === 'Global';
  if (isAnyScope || opportunity.geo_scope === profile.location) {
    eligibilityScore += 10;
  }

  const isAnyLegal = opportunity.legal_form_required.length === 0 || opportunity.legal_form_required.includes('Any');
  if (isAnyLegal || opportunity.legal_form_required.includes(profile.entity_type)) {
    eligibilityScore += 10;
  }

  // 2. Readiness (Max 30)
  const reqDocsCount = opportunity.required_documents.length;
  if (reqDocsCount > 0) {
    const matchedDocs = opportunity.required_documents.filter(doc => profile.documents_ready.includes(doc)).length;
    readinessScore += (matchedDocs / reqDocsCount) * 15;
  } else {
    readinessScore += 15;
  }
  
  if (profile.has_bank_account) readinessScore += 5;
  if (profile.has_sars_tax) readinessScore += 5;
  if (profile.has_cipc_registration) readinessScore += 5;

  // 3. Speed (Max 15)
  // Higher score for rolling frequency or highly active issuers
  if (opportunity.frequency?.toLowerCase().includes('rolling') || opportunity.frequency?.toLowerCase().includes('always open')) {
    speedScore += 15;
  } else {
    speedScore += 7; // Average speed
  }

  // 4. Value Fit (Max 15)
  // Non-cash support is a bonus for value fit
  if (opportunity.non_cash_support && opportunity.non_cash_support !== 'None') {
    valueFitScore += 10;
  } else {
    valueFitScore += 5;
  }

  if (profile.revenue_band !== 'Pre-revenue' && opportunity.amount_max > 50000) {
    valueFitScore += 5;
  }

  const totalScore = Math.min(100, Math.round(eligibilityScore + readinessScore + speedScore + valueFitScore));

  let matchReason = `Strong match for your industry (${profile.industry || 'Unknown'}).`;
  if (readinessScore > 20) {
    matchReason += " Your business is highly prepared for this application.";
  } else if (readinessScore < 10) {
    matchReason += " You need to gather more documents to improve your chances.";
  }

  return {
    opportunityId: opportunity.opportunity_id,
    totalScore,
    eligibilityScore,
    readinessScore,
    speedScore,
    valueFitScore,
    matchReason
  };
}

export function getMatchMeOpportunities(
  profile: UserBusinessProfile,
  opportunities: FundingOpportunityDb[]
): { item: FundingOpportunityDb; score: number; reason: string }[] {
  return opportunities
    .map(opp => {
      const match = calculateMatch(profile, opp);
      return { item: opp, score: match.totalScore, reason: match.matchReason };
    })
    .sort((a, b) => b.score - a.score);
}

export function getApplyReadyOpportunities(
  profile: UserBusinessProfile,
  opportunities: FundingOpportunityDb[]
): { item: FundingOpportunityDb; score: number; reason: string }[] {
  return opportunities
    .map(opp => {
      const match = calculateMatch(profile, opp);
      return { item: opp, score: match.totalScore, reason: match.matchReason, readinessScore: match.readinessScore };
    })
    .filter(wrapped => wrapped.readinessScore >= 20) // Only highly ready
    .sort((a, b) => b.readinessScore - a.readinessScore);
}


================================================================================
FILE: constants.ts
================================================================================


import { FundingType, FundingOpportunityDb, Achievement } from './types';

export const MOCK_FUNDING: FundingOpportunityDb[] = [
  {
    opportunity_id: "nyda_grant_001",
    programme_name: "NYDA Micro Finance Grant",
    issuer_name: "National Youth Development Agency (NYDA)",
    issuer_type: "Government Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Early Stage",
    legal_form_required: ["Private Company","Sole Proprietor","Cooperative"],
    sector_tags: ["Any"],
    geo_scope: "National",
    amount_min: 1000,
    amount_max: 200000,
    non_cash_support: "Business Management Training",
    eligibility_summary: "Targeted at youth entrepreneurs (18-35 years) to acquire equipment, stock, or formalization. Must possess skills or experience related to the business.",
    required_documents: ["ID","Proof of Address","Business Plan","Quotations","Banking Details"],
    application_url: "https://erp.nyda.gov.za/",
    pdf_form_url: "/assets/forms/nyda-grant-application.pdf",
    logo_url: "/assets/logos/nyda-logo.png",
    source_url: "https://www.nyda.gov.za/Products-Services/NYDA-Grant-Programme",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "info@nyda.gov.za",
    contact_phone: "0800 52 52 52",
    last_verified_at: "2023-10-01T10:00:00Z",
    verification_notes: "Verified via direct NYDA portal",
    confidence_score: 98,
  },
  {
    opportunity_id: "tia_seed_002",
    programme_name: "TIA Seed Fund",
    issuer_name: "Technology Innovation Agency (TIA)",
    issuer_type: "Government Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Pre-seed / MVP",
    legal_form_required: ["Private Company","Higher Education Institution"],
    sector_tags: ["Technology","Bio-tech","Energy","Advanced Manufacturing"],
    geo_scope: "National",
    amount_min: 50000,
    amount_max: 500000,
    non_cash_support: "Incubation Support",
    eligibility_summary: "To assist SMMEs and higher education institutions in advancing research outputs to fundable ideas for commercialization. Idea must be novel.",
    required_documents: ["Business Plan","Pitch Deck","Technical Overview","Commercialization Strategy"],
    application_url: "https://www.tia.org.za/seed-fund/",
    logo_url: "/assets/logos/tia-logo.png",
    source_url: "https://www.tia.org.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "seedfund@tia.org.za",
    contact_phone: "012 472 2700",
    last_verified_at: "2023-10-10T12:00:00Z",
    verification_notes: "Checked TIA website for 2023 cycle",
    confidence_score: 95,
  },
  {
    opportunity_id: "sefa_direct_003",
    programme_name: "Direct Lending Programme",
    issuer_name: "Small Enterprise Finance Agency",
    issuer_type: "Development Finance Institution",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation"],
    sector_tags: ["Manufacturing","Agriculture","Services"],
    geo_scope: "National",
    amount_min: 50000,
    amount_max: 15000000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Loans for bridging, asset finance, and working capital. The business must be viable and economically viable over the loan term.",
    required_documents: ["Financial Statements","Business Plan","FICA Documents"],
    application_url: "https://www.sefa.org.za/products/direct-lending",
    source_url: "https://www.sefa.org.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "info@sefa.org.za",
    last_verified_at: "2023-09-20T08:00:00Z",
    confidence_score: 90,
  },
  {
    opportunity_id: "nef_general_004",
    programme_name: "iMbewu Fund",
    issuer_name: "National Empowerment Fund",
    issuer_type: "Development Finance Institution",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Early Stage",
    legal_form_required: ["Private Company"],
    sector_tags: ["Any"],
    geo_scope: "National",
    amount_min: 250000,
    amount_max: 50000000,
    non_cash_support: "Financial Management Support",
    eligibility_summary: "Geared towards black-owned businesses. Provides both debt and quasi-equity. Black women ownership receives preference.",
    required_documents: ["B-BBEE Certificate","Business Plan","Off-take Agreements"],
    application_url: "https://www.nefcorp.co.za/imbewu-fund/",
    source_url: "https://www.nefcorp.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-10-05T09:00:00Z",
    confidence_score: 92,
  },
  {
    opportunity_id: "idc_general_005",
    programme_name: "Agro-Processing & Agriculture",
    issuer_name: "Industrial Development Corporation (IDC)",
    issuer_type: "Development Finance Institution",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Public Company"],
    sector_tags: ["Agriculture","Agro-processing"],
    geo_scope: "National",
    amount_min: 1000000,
    amount_max: 1000000000,
    non_cash_support: "Strategic Business Development",
    eligibility_summary: "Funding for high-impact capital intensive projects. Must demonstrate economic merit, job creation, and developmental impact.",
    required_documents: ["Feasibility Study","Financial Model","Off-take Agreements","EIA"],
    application_url: "https://www.idc.co.za/agro-processing-and-agriculture/",
    source_url: "https://www.idc.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-11-01T09:00:00Z",
    confidence_score: 99,
  },
  {
    opportunity_id: "landbank_agri_006",
    programme_name: "Emerging Farmer Development Scheme",
    issuer_name: "Land Bank",
    issuer_type: "Development Finance Institution",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Sole Proprietor","Cooperative"],
    sector_tags: ["Agriculture"],
    geo_scope: "National",
    amount_min: 50000,
    amount_max: 15000000,
    non_cash_support: "Technical Farming Assistance",
    eligibility_summary: "Targeted at previously disadvantaged individuals looking to enter the commercial farming space. Loan covers land, equipment and working capital.",
    required_documents: ["Farm Business Plan","Proof of Access to Land","Financials"],
    application_url: "https://landbank.co.za",
    source_url: "https://landbank.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-10-15T09:00:00Z",
    confidence_score: 85,
  },
  {
    opportunity_id: "dbsa_infra_007",
    programme_name: "Infrastructure Project Preparation",
    issuer_name: "Development Bank of Southern Africa",
    issuer_type: "Development Finance Institution",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Pre-seed / MVP",
    legal_form_required: ["Private Company","Public Company","Municipality"],
    sector_tags: ["Infrastructure","Energy","Water"],
    geo_scope: "National",
    amount_min: 5000000,
    amount_max: 50000000,
    non_cash_support: "Feasibility Consulting",
    eligibility_summary: "Provides preparation funding to turn high-impact infrastructure concepts into bankable projects.",
    required_documents: ["Concept Note","Sponsor Details"],
    application_url: "https://www.dbsa.org",
    source_url: "https://www.dbsa.org",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-09-01T09:00:00Z",
    confidence_score: 91,
  },
  {
    opportunity_id: "ecdc_finance_008",
    programme_name: "Enterprise Finance",
    issuer_name: "Eastern Cape Development Corporation",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation","Cooperative"],
    sector_tags: ["Manufacturing","Tourism","Agro-processing"],
    geo_scope: "Eastern Cape",
    amount_min: 50000,
    amount_max: 20000000,
    non_cash_support: "Market Access",
    eligibility_summary: "Term loans and short-term finance for Eastern Cape based businesses showing growth potential.",
    required_documents: ["Business Plan","Tax Clearance","Projections"],
    application_url: "https://www.ecdc.co.za",
    source_url: "https://www.ecdc.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-08-11T09:00:00Z",
    confidence_score: 88,
  },
  {
    opportunity_id: "gep_sme_009",
    programme_name: "Financial Support Programme",
    issuer_name: "Gauteng Enterprise Propeller",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation","Cooperative"],
    sector_tags: ["Any"],
    geo_scope: "Gauteng",
    amount_min: 10000,
    amount_max: 250000,
    non_cash_support: "Incubation",
    eligibility_summary: "Micro and small enterprise funding for working capital and asset finance for Gauteng-based SMMEs.",
    required_documents: ["Business Plan","Proof of Residence","Financials"],
    application_url: "https://www.gep.co.za",
    source_url: "https://www.gep.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-11-20T09:00:00Z",
    confidence_score: 89,
  },
  {
    opportunity_id: "ithala_kzn_010",
    programme_name: "Business Finance",
    issuer_name: "Ithala Development Finance Corporation",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation","Cooperative"],
    sector_tags: ["Agriculture","Tourism","Manufacturing"],
    geo_scope: "KwaZulu-Natal",
    amount_min: 50000,
    amount_max: 50000000,
    non_cash_support: "Property & Industrial Parks",
    eligibility_summary: "Commercial property and business lending specifically tailored to entrepreneurs based in KZN.",
    required_documents: ["Business Plan","Financial Model","FICA"],
    application_url: "https://www.ithala.co.za",
    source_url: "https://www.ithala.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-10-30T09:00:00Z",
    confidence_score: 93,
  },
  {
    opportunity_id: "leda_limpopo_011",
    programme_name: "Enterprise Funding Division",
    issuer_name: "Limpopo Economic Development Agency (LEDA)",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation","Cooperative"],
    sector_tags: ["Manufacturing","Mining","Agriculture"],
    geo_scope: "Limpopo",
    amount_min: 100000,
    amount_max: 10000000,
    non_cash_support: "Training & Development",
    eligibility_summary: "Provides bridging finance, franchise finance, and term loans for businesses operating within Limpopo.",
    required_documents: ["Business Plan","Financials","Proof of Trading"],
    application_url: "https://www.lieda.co.za",
    source_url: "https://www.lieda.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-05-15T09:00:00Z",
    confidence_score: 80,
  },
  {
    opportunity_id: "nwdc_bridge_012",
    programme_name: "Bridging Finance",
    issuer_name: "North West Development Corporation",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation"],
    sector_tags: ["Construction","Services"],
    geo_scope: "North West",
    amount_min: 50000,
    amount_max: 5000000,
    non_cash_support: "None",
    eligibility_summary: "Short-term funding for businesses that have secured valid contracts/orders from government or verified private entities.",
    required_documents: ["Valid Invoice/Purchase Order","Business Plan","Tax Clearance"],
    application_url: "https://nwdc.co.za",
    source_url: "https://nwdc.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-01-20T09:00:00Z",
    confidence_score: 75,
  },
  {
    opportunity_id: "fdc_fs_013",
    programme_name: "SMME Funding",
    issuer_name: "Free State Development Corporation",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation","Cooperative"],
    sector_tags: ["Any"],
    geo_scope: "Free State",
    amount_min: 20000,
    amount_max: 3000000,
    non_cash_support: "Export Promotion",
    eligibility_summary: "Funding for working capital and asset finance for Free State registered SMMEs to promote provincial job creation.",
    required_documents: ["Business Plan","Financials","Proof of FS operations"],
    application_url: "https://fdc.co.za",
    source_url: "https://fdc.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-06-11T09:00:00Z",
    confidence_score: 78,
  },
  {
    opportunity_id: "mega_mppu_014",
    programme_name: "Business Finance",
    issuer_name: "Mpumalanga Economic Growth Agency",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Close Corporation","Cooperative"],
    sector_tags: ["Agriculture","Tourism"],
    geo_scope: "Mpumalanga",
    amount_min: 50000,
    amount_max: 10000000,
    non_cash_support: "Trade & Investment Promotion",
    eligibility_summary: "Assistance for SMMEs operating in Mpumalanga looking for expansion or asset financing.",
    required_documents: ["Business Plan","Financial projections","Tax Clearance"],
    application_url: "https://mega.gov.za",
    source_url: "https://mega.gov.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-04-18T09:00:00Z",
    confidence_score: 82,
  },
  {
    opportunity_id: "casidra_wc_015",
    programme_name: "Agricultural Support",
    issuer_name: "Casidra",
    issuer_type: "Provincial Agency",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Growth",
    legal_form_required: ["Private Company","Sole Proprietor","Cooperative"],
    sector_tags: ["Agriculture"],
    geo_scope: "Western Cape",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Extension Services",
    eligibility_summary: "Implements the Comprehensive Agricultural Support Programme (CASP) for emerging farmers in the Western Cape.",
    required_documents: ["Farm Plan","Proof of Land Access"],
    application_url: "https://www.casidra.co.za",
    source_url: "https://www.casidra.co.za",
    closing_date: "Rolling",
    frequency: "Subject to annual budget cycles",
    last_verified_at: "2023-11-05T09:00:00Z",
    confidence_score: 87,
  },
  {
    opportunity_id: "ttf_tourism_016",
    programme_name: "Tourism Transformation Fund",
    issuer_name: "Department of Tourism & NEF",
    issuer_type: "Government Department",
    official_status: true,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Growth",
    legal_form_required: ["Private Company"],
    sector_tags: ["Tourism"],
    geo_scope: "National",
    amount_min: 100000,
    amount_max: 5000000,
    non_cash_support: "Market Access",
    eligibility_summary: "Blended funding (grant + loan) to drive transformation in the tourism sector. Business must be majority black-owned.",
    required_documents: ["Business Plan","B-BBEE Certificate","Tourism Grading"],
    application_url: "https://www.tourism.gov.za",
    source_url: "https://www.tourism.gov.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-08-25T09:00:00Z",
    confidence_score: 94,
  },
  {
    opportunity_id: "bp_private_017",
    programme_name: "SME Finance",
    issuer_name: "Business Partners",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Growth",
    legal_form_required: ["Private Company"],
    sector_tags: ["Any"],
    geo_scope: "National",
    amount_min: 500000,
    amount_max: 50000000,
    non_cash_support: "Technical Assistance Facility",
    eligibility_summary: "Targeted at formal, growth-oriented SMEs. No start-ups unless they are franchises with a proven model.",
    required_documents: ["Audited Financials","Business Plan","Management Accounts"],
    application_url: "https://www.businesspartners.co.za",
    source_url: "https://www.businesspartners.co.za",
    closing_date: "Rolling",
    frequency: "Always Open",
    last_verified_at: "2023-11-28T09:00:00Z",
    confidence_score: 96,
  },
  {
    opportunity_id: "intl_usaid_018",
    programme_name: "Prosper Africa",
    issuer_name: "USAID",
    issuer_type: "International",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Growth",
    legal_form_required: ["Private Company","NGO"],
    sector_tags: ["Technology","Agriculture","Trade"],
    geo_scope: "Pan-African",
    amount_min: 500000,
    amount_max: 10000000,
    non_cash_support: "Trade Facilitation",
    eligibility_summary: "Funding for high-impact trade and investment projects looking to scale US-Africa trade. Strict compliance and reporting required.",
    required_documents: ["Concept Note","Compliance Forms","Financials"],
    application_url: "https://www.prosperafrica.gov",
    source_url: "https://www.prosperafrica.gov",
    closing_date: "2024-12-31",
    frequency: "Specific Windows",
    last_verified_at: "2023-10-01T09:00:00Z",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_19",
    programme_name: "South African Funding Opportunity 19",
    issuer_name: "Private / Government 19",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_20",
    programme_name: "South African Funding Opportunity 20",
    issuer_name: "Private / Government 20",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_21",
    programme_name: "South African Funding Opportunity 21",
    issuer_name: "Private / Government 21",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_22",
    programme_name: "South African Funding Opportunity 22",
    issuer_name: "Private / Government 22",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_23",
    programme_name: "South African Funding Opportunity 23",
    issuer_name: "Private / Government 23",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_24",
    programme_name: "South African Funding Opportunity 24",
    issuer_name: "Private / Government 24",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_25",
    programme_name: "South African Funding Opportunity 25",
    issuer_name: "Private / Government 25",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_26",
    programme_name: "South African Funding Opportunity 26",
    issuer_name: "Private / Government 26",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_27",
    programme_name: "South African Funding Opportunity 27",
    issuer_name: "Private / Government 27",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_28",
    programme_name: "South African Funding Opportunity 28",
    issuer_name: "Private / Government 28",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_29",
    programme_name: "South African Funding Opportunity 29",
    issuer_name: "Private / Government 29",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_30",
    programme_name: "South African Funding Opportunity 30",
    issuer_name: "Private / Government 30",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_31",
    programme_name: "South African Funding Opportunity 31",
    issuer_name: "Private / Government 31",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_32",
    programme_name: "South African Funding Opportunity 32",
    issuer_name: "Private / Government 32",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.458Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_33",
    programme_name: "South African Funding Opportunity 33",
    issuer_name: "Private / Government 33",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_34",
    programme_name: "South African Funding Opportunity 34",
    issuer_name: "Private / Government 34",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_35",
    programme_name: "South African Funding Opportunity 35",
    issuer_name: "Private / Government 35",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_36",
    programme_name: "South African Funding Opportunity 36",
    issuer_name: "Private / Government 36",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_37",
    programme_name: "South African Funding Opportunity 37",
    issuer_name: "Private / Government 37",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_38",
    programme_name: "South African Funding Opportunity 38",
    issuer_name: "Private / Government 38",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_39",
    programme_name: "South African Funding Opportunity 39",
    issuer_name: "Private / Government 39",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_40",
    programme_name: "South African Funding Opportunity 40",
    issuer_name: "Private / Government 40",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_41",
    programme_name: "South African Funding Opportunity 41",
    issuer_name: "Private / Government 41",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_42",
    programme_name: "South African Funding Opportunity 42",
    issuer_name: "Private / Government 42",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_43",
    programme_name: "South African Funding Opportunity 43",
    issuer_name: "Private / Government 43",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_44",
    programme_name: "South African Funding Opportunity 44",
    issuer_name: "Private / Government 44",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_45",
    programme_name: "South African Funding Opportunity 45",
    issuer_name: "Private / Government 45",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_46",
    programme_name: "South African Funding Opportunity 46",
    issuer_name: "Private / Government 46",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_47",
    programme_name: "South African Funding Opportunity 47",
    issuer_name: "Private / Government 47",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_48",
    programme_name: "South African Funding Opportunity 48",
    issuer_name: "Private / Government 48",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_49",
    programme_name: "South African Funding Opportunity 49",
    issuer_name: "Private / Government 49",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_50",
    programme_name: "South African Funding Opportunity 50",
    issuer_name: "Private / Government 50",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_51",
    programme_name: "South African Funding Opportunity 51",
    issuer_name: "Private / Government 51",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_52",
    programme_name: "South African Funding Opportunity 52",
    issuer_name: "Private / Government 52",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_53",
    programme_name: "South African Funding Opportunity 53",
    issuer_name: "Private / Government 53",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_54",
    programme_name: "South African Funding Opportunity 54",
    issuer_name: "Private / Government 54",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_55",
    programme_name: "South African Funding Opportunity 55",
    issuer_name: "Private / Government 55",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_56",
    programme_name: "South African Funding Opportunity 56",
    issuer_name: "Private / Government 56",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.459Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_57",
    programme_name: "South African Funding Opportunity 57",
    issuer_name: "Private / Government 57",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_58",
    programme_name: "South African Funding Opportunity 58",
    issuer_name: "Private / Government 58",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_59",
    programme_name: "South African Funding Opportunity 59",
    issuer_name: "Private / Government 59",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_60",
    programme_name: "South African Funding Opportunity 60",
    issuer_name: "Private / Government 60",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_61",
    programme_name: "South African Funding Opportunity 61",
    issuer_name: "Private / Government 61",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_62",
    programme_name: "South African Funding Opportunity 62",
    issuer_name: "Private / Government 62",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_63",
    programme_name: "South African Funding Opportunity 63",
    issuer_name: "Private / Government 63",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_64",
    programme_name: "South African Funding Opportunity 64",
    issuer_name: "Private / Government 64",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_65",
    programme_name: "South African Funding Opportunity 65",
    issuer_name: "Private / Government 65",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.460Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_66",
    programme_name: "South African Funding Opportunity 66",
    issuer_name: "Private / Government 66",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_67",
    programme_name: "South African Funding Opportunity 67",
    issuer_name: "Private / Government 67",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_68",
    programme_name: "South African Funding Opportunity 68",
    issuer_name: "Private / Government 68",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_69",
    programme_name: "South African Funding Opportunity 69",
    issuer_name: "Private / Government 69",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_70",
    programme_name: "South African Funding Opportunity 70",
    issuer_name: "Private / Government 70",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_71",
    programme_name: "South African Funding Opportunity 71",
    issuer_name: "Private / Government 71",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_72",
    programme_name: "South African Funding Opportunity 72",
    issuer_name: "Private / Government 72",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_73",
    programme_name: "South African Funding Opportunity 73",
    issuer_name: "Private / Government 73",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_74",
    programme_name: "South African Funding Opportunity 74",
    issuer_name: "Private / Government 74",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_75",
    programme_name: "South African Funding Opportunity 75",
    issuer_name: "Private / Government 75",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_76",
    programme_name: "South African Funding Opportunity 76",
    issuer_name: "Private / Government 76",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_77",
    programme_name: "South African Funding Opportunity 77",
    issuer_name: "Private / Government 77",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_78",
    programme_name: "South African Funding Opportunity 78",
    issuer_name: "Private / Government 78",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_79",
    programme_name: "South African Funding Opportunity 79",
    issuer_name: "Private / Government 79",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_80",
    programme_name: "South African Funding Opportunity 80",
    issuer_name: "Private / Government 80",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.462Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_81",
    programme_name: "South African Funding Opportunity 81",
    issuer_name: "Private / Government 81",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_82",
    programme_name: "South African Funding Opportunity 82",
    issuer_name: "Private / Government 82",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_83",
    programme_name: "South African Funding Opportunity 83",
    issuer_name: "Private / Government 83",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_84",
    programme_name: "South African Funding Opportunity 84",
    issuer_name: "Private / Government 84",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_85",
    programme_name: "South African Funding Opportunity 85",
    issuer_name: "Private / Government 85",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_86",
    programme_name: "South African Funding Opportunity 86",
    issuer_name: "Private / Government 86",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_87",
    programme_name: "South African Funding Opportunity 87",
    issuer_name: "Private / Government 87",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_88",
    programme_name: "South African Funding Opportunity 88",
    issuer_name: "Private / Government 88",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_89",
    programme_name: "South African Funding Opportunity 89",
    issuer_name: "Private / Government 89",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_90",
    programme_name: "South African Funding Opportunity 90",
    issuer_name: "Private / Government 90",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_91",
    programme_name: "South African Funding Opportunity 91",
    issuer_name: "Private / Government 91",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_92",
    programme_name: "South African Funding Opportunity 92",
    issuer_name: "Private / Government 92",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_93",
    programme_name: "South African Funding Opportunity 93",
    issuer_name: "Private / Government 93",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_94",
    programme_name: "South African Funding Opportunity 94",
    issuer_name: "Private / Government 94",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_95",
    programme_name: "South African Funding Opportunity 95",
    issuer_name: "Private / Government 95",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_96",
    programme_name: "South African Funding Opportunity 96",
    issuer_name: "Private / Government 96",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_97",
    programme_name: "South African Funding Opportunity 97",
    issuer_name: "Private / Government 97",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_98",
    programme_name: "South African Funding Opportunity 98",
    issuer_name: "Private / Government 98",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.463Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_99",
    programme_name: "South African Funding Opportunity 99",
    issuer_name: "Private / Government 99",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_100",
    programme_name: "South African Funding Opportunity 100",
    issuer_name: "Private / Government 100",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_101",
    programme_name: "South African Funding Opportunity 101",
    issuer_name: "Private / Government 101",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_102",
    programme_name: "South African Funding Opportunity 102",
    issuer_name: "Private / Government 102",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_103",
    programme_name: "South African Funding Opportunity 103",
    issuer_name: "Private / Government 103",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_104",
    programme_name: "South African Funding Opportunity 104",
    issuer_name: "Private / Government 104",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_105",
    programme_name: "South African Funding Opportunity 105",
    issuer_name: "Private / Government 105",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.464Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_106",
    programme_name: "South African Funding Opportunity 106",
    issuer_name: "Private / Government 106",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_107",
    programme_name: "South African Funding Opportunity 107",
    issuer_name: "Private / Government 107",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_108",
    programme_name: "South African Funding Opportunity 108",
    issuer_name: "Private / Government 108",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_109",
    programme_name: "South African Funding Opportunity 109",
    issuer_name: "Private / Government 109",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_110",
    programme_name: "South African Funding Opportunity 110",
    issuer_name: "Private / Government 110",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_111",
    programme_name: "South African Funding Opportunity 111",
    issuer_name: "Private / Government 111",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_112",
    programme_name: "South African Funding Opportunity 112",
    issuer_name: "Private / Government 112",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_113",
    programme_name: "South African Funding Opportunity 113",
    issuer_name: "Private / Government 113",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_114",
    programme_name: "South African Funding Opportunity 114",
    issuer_name: "Private / Government 114",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_115",
    programme_name: "South African Funding Opportunity 115",
    issuer_name: "Private / Government 115",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_116",
    programme_name: "South African Funding Opportunity 116",
    issuer_name: "Private / Government 116",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_117",
    programme_name: "South African Funding Opportunity 117",
    issuer_name: "Private / Government 117",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_118",
    programme_name: "South African Funding Opportunity 118",
    issuer_name: "Private / Government 118",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_119",
    programme_name: "South African Funding Opportunity 119",
    issuer_name: "Private / Government 119",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_120",
    programme_name: "South African Funding Opportunity 120",
    issuer_name: "Private / Government 120",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_121",
    programme_name: "South African Funding Opportunity 121",
    issuer_name: "Private / Government 121",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_122",
    programme_name: "South African Funding Opportunity 122",
    issuer_name: "Private / Government 122",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_123",
    programme_name: "South African Funding Opportunity 123",
    issuer_name: "Private / Government 123",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_124",
    programme_name: "South African Funding Opportunity 124",
    issuer_name: "Private / Government 124",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_125",
    programme_name: "South African Funding Opportunity 125",
    issuer_name: "Private / Government 125",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_126",
    programme_name: "South African Funding Opportunity 126",
    issuer_name: "Private / Government 126",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_127",
    programme_name: "South African Funding Opportunity 127",
    issuer_name: "Private / Government 127",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_128",
    programme_name: "South African Funding Opportunity 128",
    issuer_name: "Private / Government 128",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_129",
    programme_name: "South African Funding Opportunity 129",
    issuer_name: "Private / Government 129",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_130",
    programme_name: "South African Funding Opportunity 130",
    issuer_name: "Private / Government 130",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_131",
    programme_name: "South African Funding Opportunity 131",
    issuer_name: "Private / Government 131",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_132",
    programme_name: "South African Funding Opportunity 132",
    issuer_name: "Private / Government 132",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_133",
    programme_name: "South African Funding Opportunity 133",
    issuer_name: "Private / Government 133",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_134",
    programme_name: "South African Funding Opportunity 134",
    issuer_name: "Private / Government 134",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_135",
    programme_name: "South African Funding Opportunity 135",
    issuer_name: "Private / Government 135",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_136",
    programme_name: "South African Funding Opportunity 136",
    issuer_name: "Private / Government 136",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_137",
    programme_name: "South African Funding Opportunity 137",
    issuer_name: "Private / Government 137",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_138",
    programme_name: "South African Funding Opportunity 138",
    issuer_name: "Private / Government 138",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_139",
    programme_name: "South African Funding Opportunity 139",
    issuer_name: "Private / Government 139",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.466Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_140",
    programme_name: "South African Funding Opportunity 140",
    issuer_name: "Private / Government 140",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.467Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_141",
    programme_name: "South African Funding Opportunity 141",
    issuer_name: "Private / Government 141",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.467Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_142",
    programme_name: "South African Funding Opportunity 142",
    issuer_name: "Private / Government 142",
    issuer_type: "Private",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.LOAN,
    target_stage: "Various",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Various"],
    geo_scope: "National",
    amount_min: 10000,
    amount_max: 500000,
    non_cash_support: "Mentorship",
    eligibility_summary: "Funding for South African SMEs to assist with operational growth and sustainability.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "",
    source_url: "",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.467Z",
    verification_notes: "",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_143",
    programme_name: "Momentum Metropolitan Holdings – Momentum Metropolitan Foundation Funding",
    issuer_name: "Momentum Metropolitan Holdings – Momentum Metropolitan Foundation",
    issuer_type: "Corporate Foundation / Enterprise Development",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Start‑up to growth; must have a viable business model.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Financial services, insurance, healthcare, educati"],
    geo_scope: "National.",
    amount_min: 250,
    amount_max: 2000000,
    non_cash_support: "Promote socio‑economic development by funding black‑owned SMMEs, with a strong focus on financial inclusion, education, and health‑related enterprises.",
    eligibility_summary: "Financial services, insurance, healthcare, education, technology. Business plan, tax clearance, B‑BBEE affidavit. Collateral may be required for loans.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.momentummetropolitan.co.za (Foundation section)",
    source_url: "https://www.momentummetropolitan.co.za (Foundation section)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Check the Foundation’s website for funding cycles.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_144",
    programme_name: "Glencore South Africa – Glencore Community Development & Enterprise Funds Funding",
    issuer_name: "Glencore South Africa – Glencore Community Development & Enterprise Funds",
    issuer_type: "Corporate Enterprise Development (Mining and Resources)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Survivalist to growth stage; must be based in or near Glencore host communities.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Agriculture, light manufacturing, construction, mi"],
    geo_scope: "Mpumalanga, Limpopo, North West.",
    amount_min: 10,
    amount_max: 1500000,
    non_cash_support: "Invest in economic diversification and SMME development in the communities where Glencore operates, particularly in coal, ferroalloy, and chrome mining areas.",
    eligibility_summary: "Agriculture, light manufacturing, construction, mining services, tourism. Business plan, tax clearance, B‑BBEE affidavit. No collateral for small grants.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.glencore.com/south-africa (Sustainability / Community)",
    source_url: "https://www.glencore.com/south-africa (Sustainability / Community)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Contact regional offices; occasional public calls.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_145",
    programme_name: "ArcelorMittal South Africa – AMSA Enterprise Development Funding",
    issuer_name: "ArcelorMittal South Africa – AMSA Enterprise Development",
    issuer_type: "Corporate Enterprise Development (Manufacturing)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Growth stage; must have a track record or clear potential to enter the steel supply chain.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Steel processing, engineering, manufacturing, cons"],
    geo_scope: "Gauteng, KZN, Western Cape.",
    amount_min: 300,
    amount_max: 5000000,
    non_cash_support: "Develop black‑owned SMMEs in the steel, engineering, and construction value chain through grants, loans, and preferential procurement.",
    eligibility_summary: "Steel processing, engineering, manufacturing, construction, logistics. Business plan, financial statements, tax clearance, B‑BBEE certificate. Collateral may be required for loans.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.arcelormittalsa.com (Sustainability / Enterprise Development)",
    source_url: "https://www.arcelormittalsa.com (Sustainability / Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Monitor AMSA’s corporate news; contact the ED office.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_146",
    programme_name: "Northam Platinum – Northam Enterprise Development Fund Funding",
    issuer_name: "Northam Platinum – Northam Enterprise Development Fund",
    issuer_type: "Corporate Enterprise Development (Mining)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Start‑up to growth; must operate in or supply the mine’s host communities.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Mining services, engineering, construction, agricu"],
    geo_scope: "Limpopo, North West.",
    amount_min: 200,
    amount_max: 3000000,
    non_cash_support: "Promote economic empowerment in the platinum belt by funding SMMEs in and around Northam’s mining operations, including the Booysendal and Zondereinde mines.",
    eligibility_summary: "Mining services, engineering, construction, agriculture, hospitality. Business plan, tax clearance, B‑BBEE affidavit. Own contribution may be required for larger loans.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.northam.co.za (Sustainability / Community)",
    source_url: "https://www.northam.co.za (Sustainability / Community)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Contact the mine’s community liaison; periodic calls for proposals.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_147",
    programme_name: "Aspen Pharmacare – Aspen Foundation (Enterprise Development Stream) Funding",
    issuer_name: "Aspen Pharmacare – Aspen Foundation (Enterprise Development Stream)",
    issuer_type: "Corporate Foundation / Enterprise Development",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Start‑up to growth.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Healthcare, pharmaceuticals, medical devices, heal"],
    geo_scope: "National, with emphasis on Eastern Cape and Gauteng.",
    amount_min: 20,
    amount_max: 1000000,
    non_cash_support: "Improve health outcomes and support economic development by funding health‑related SMMEs and community‑based enterprises.",
    eligibility_summary: "Healthcare, pharmaceuticals, medical devices, health‑tech, community health services. Business plan, relevant health permits or registrations, tax clearance, B‑BBEE affidavit.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.aspenpharma.com (Aspen Foundation)",
    source_url: "https://www.aspenpharma.com (Aspen Foundation)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Check the Aspen Foundation page for open calls.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_148",
    programme_name: "British American Tobacco South Africa (BATSA) – Enterprise Development Programmes Funding",
    issuer_name: "British American Tobacco South Africa (BATSA) – Enterprise Development Programmes",
    issuer_type: "Corporate Enterprise Development (secondary JSE listing)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Emerging farmers and start‑up SMMEs.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Agriculture (tobacco and alternative crops), manuf"],
    geo_scope: "Mpumalanga, Limpopo, Eastern Cape, Western Cape.",
    amount_min: 150,
    amount_max: 300,
    non_cash_support: "Support emerging black‑owned farmers and SMMEs in the tobacco, agriculture, and manufacturing sectors, with a strong focus on rural livelihoods.",
    eligibility_summary: "Agriculture (tobacco and alternative crops), manufacturing, retail, distribution. Business plan, proof of land access (for farmers), tax clearance, B‑BBEE affidavit.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.batsa.co.za (Sustainability / Enterprise Development)",
    source_url: "https://www.batsa.co.za (Sustainability / Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Contact local BATSA community liaison; programme cycles vary.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_149",
    programme_name: "Italtile – Italtile Foundation and CSI Enterprise Development Funding",
    issuer_name: "Italtile – Italtile Foundation and CSI Enterprise Development",
    issuer_type: "Corporate Foundation / CSI",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Survivalist to growth stage; must be operating in the building sector.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Building construction, tiling, bathroom/kitchen re"],
    geo_scope: "National.",
    amount_min: 5,
    amount_max: 150,
    non_cash_support: "Empower small building contractors, tilers, and ceramic/craft SMMEs through grants, tools, and training.",
    eligibility_summary: "Building construction, tiling, bathroom/kitchen renovation, light manufacturing of building products. Simple business profile or proposal; no collateral required for small grants.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.italtile.com (Foundation / CSI)",
    source_url: "https://www.italtile.com (Foundation / CSI)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Check website; in‑store community boards.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_150",
    programme_name: "Resilient REIT – Resilient Community Grants Funding",
    issuer_name: "Resilient REIT – Resilient Community Grants",
    issuer_type: "Corporate CSI / Enterprise Development (Property REIT)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Micro to small; survivalist considered.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Retail, catering, services, light manufacturing."],
    geo_scope: "Limpopo, Gauteng, North West, KZN.",
    amount_min: 5,
    amount_max: 50,
    non_cash_support: "Support SMMEs and community enterprises in the vicinity of Resilient’s shopping centres through small grants and business development.",
    eligibility_summary: "Retail, catering, services, light manufacturing. Simple business plan or proposal; no collateral.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.resilient.co.za (Sustainability / Community)",
    source_url: "https://www.resilient.co.za (Sustainability / Community)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Contact local centre management.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_151",
    programme_name: "Hyprop Investments – Hyprop Foundation (Enterprise Development) Funding",
    issuer_name: "Hyprop Investments – Hyprop Foundation (Enterprise Development)",
    issuer_type: "Corporate Foundation / ED (Property REIT)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Start‑up and early growth.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Retail, food & beverage, services, creative indust"],
    geo_scope: "Gauteng, Western Cape.",
    amount_min: 100,
    amount_max: 100,
    non_cash_support: "Promote economic inclusion by funding SMMEs in and around Hyprop’s shopping centres (e.g., Canal Walk, Rosebank Mall, Clearwater).",
    eligibility_summary: "Retail, food & beverage, services, creative industries. Business plan; ability to meet mall standards.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.hyprop.co.za (Sustainability)",
    source_url: "https://www.hyprop.co.za (Sustainability)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.468Z",
    verification_notes: "Check property management offices.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_152",
    programme_name: "Vukile Property Fund – Vukile Enterprise Development Funding",
    issuer_name: "Vukile Property Fund – Vukile Enterprise Development",
    issuer_type: "Corporate ED (Property REIT)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Growth stage.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Property services, retail, security, cleaning, mai"],
    geo_scope: "National.",
    amount_min: 150,
    amount_max: 150,
    non_cash_support: "Develop black‑owned SMMEs that provide services and products to Vukile’s portfolio of shopping centres and industrial parks.",
    eligibility_summary: "Property services, retail, security, cleaning, maintenance. Business plan, tax clearance.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.vukile.co.za (Sustainability)",
    source_url: "https://www.vukile.co.za (Sustainability)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.469Z",
    verification_notes: "Check website.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_153",
    programme_name: "Blue Label Telecoms – Blue Label Enterprise Development Funding",
    issuer_name: "Blue Label Telecoms – Blue Label Enterprise Development",
    issuer_type: "Corporate Enterprise Development (Telecoms/Fintech)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Start‑up to growth.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Fintech, digital payments, mobile airtime, retail."],
    geo_scope: "National.",
    amount_min: 150,
    amount_max: 1000000,
    non_cash_support: "Empower black‑owned SMMEs in the digital voucher, payments, and mobile airtime ecosystem through supplier development and grants.",
    eligibility_summary: "Fintech, digital payments, mobile airtime, retail. Business plan, proof of distribution capacity, tax clearance.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.bluelabeltelecoms.co.za (Enterprise Development)",
    source_url: "https://www.bluelabeltelecoms.co.za (Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.469Z",
    verification_notes: "Contact division directly.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_154",
    programme_name: "Lewis Group – Lewis Enterprise Development Funding",
    issuer_name: "Lewis Group – Lewis Enterprise Development",
    issuer_type: "Corporate Enterprise Development (Retail – Furniture and Appliances)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Growth‑stage manufacturing SMMEs.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Furniture, bedding, appliances, textiles, logistic"],
    geo_scope: "National.",
    amount_min: 300,
    amount_max: 300,
    non_cash_support: "Develop black‑owned SMMEs in the furniture, appliance, and textile manufacturing sectors that can supply the Lewis stores.",
    eligibility_summary: "Furniture, bedding, appliances, textiles, logistics. Business plan, audited financials, B‑BBEE certificate.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.lewisgroup.co.za (Sustainability / Enterprise Development)",
    source_url: "https://www.lewisgroup.co.za (Sustainability / Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Check website or contact procurement.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_155",
    programme_name: "Truworths – Truworths Enterprise Development Funding",
    issuer_name: "Truworths – Truworths Enterprise Development",
    issuer_type: "Corporate Enterprise Development (Fashion Retail)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Start‑up to growth; CMTs need capacity to produce at scale.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Clothing, textiles, footwear, accessories, fashion"],
    geo_scope: "Western Cape, KZN, Gauteng.",
    amount_min: 250,
    amount_max: 2000000,
    non_cash_support: "Integrate black‑owned SMMEs into the fashion and clothing supply chain, from design and cut‑make‑trim (CMT) to accessories and footwear.",
    eligibility_summary: "Clothing, textiles, footwear, accessories, fashion design. Business plan, portfolio (for designers), financial statements, B‑BBEE certificate.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.truworths.co.za (Corporate / Enterprise Development)",
    source_url: "https://www.truworths.co.za (Corporate / Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Monitor Truworths’ corporate sustainability page.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_156",
    programme_name: "Pan African Resources – Pan African Enterprise Development Funding",
    issuer_name: "Pan African Resources – Pan African Enterprise Development",
    issuer_type: "Corporate ED (Gold Mining)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Micro to small.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Agriculture, manufacturing, construction, services"],
    geo_scope: "Mpumalanga.",
    amount_min: 10,
    amount_max: 1000000,
    non_cash_support: "Support SMMEs and local economic development in the communities around its Barberton and Evander gold mines.",
    eligibility_summary: "Agriculture, manufacturing, construction, services. Business plan, tax clearance.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.panafricanresources.com (Sustainability / Community)",
    source_url: "https://www.panafricanresources.com (Sustainability / Community)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Contact regional offices.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_157",
    programme_name: "Tharisa – Tharisa Minerals Enterprise Development Funding",
    issuer_name: "Tharisa – Tharisa Minerals Enterprise Development",
    issuer_type: "Corporate ED (Chrome & PGM Mining)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.GRANT,
    target_stage: "Start‑up to growth.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Mining services, agriculture, services."],
    geo_scope: "North West.",
    amount_min: 100,
    amount_max: 100,
    non_cash_support: "Empower black‑owned SMMEs in the communities near its Tharisa mine on the western limb of the Bushveld Complex.",
    eligibility_summary: "Mining services, agriculture, services. Business plan.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.tharisa.com (Sustainability)",
    source_url: "https://www.tharisa.com (Sustainability)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Contact department.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_158",
    programme_name: "AECI – AECI Enterprise Development Funding",
    issuer_name: "AECI – AECI Enterprise Development",
    issuer_type: "Corporate ED (Chemicals and Explosives)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Growth stage.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Chemical distribution, explosives services, agricu"],
    geo_scope: "Gauteng, Mpumalanga, KZN.",
    amount_min: 250,
    amount_max: 2000000,
    non_cash_support: "Develop black‑owned SMMEs in the chemical, mining services, and agricultural input sectors through supplier development.",
    eligibility_summary: "Chemical distribution, explosives services, agriculture, manufacturing. Business plan, B‑BBEE certificate, safety compliance.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.aeciworld.com (Sustainability)",
    source_url: "https://www.aeciworld.com (Sustainability)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Check website.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_159",
    programme_name: "Mpact – Mpact Enterprise Development (Part of Mpact Foundation) Funding",
    issuer_name: "Mpact – Mpact Enterprise Development (Part of Mpact Foundation)",
    issuer_type: "Corporate ED (Packaging and Recycling)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Start‑up to growth.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Waste management, recycling, packaging, logistics."],
    geo_scope: "National.",
    amount_min: 20,
    amount_max: 1000000,
    non_cash_support: "Support black‑owned SMMEs in the recycling, waste management, and paper/packaging sectors through grants and supplier programmes.",
    eligibility_summary: "Waste management, recycling, packaging, logistics. Business plan, relevant waste permits, tax clearance.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.mpact.co.za (Sustainability / Enterprise Development)",
    source_url: "https://www.mpact.co.za (Sustainability / Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Check website or contact recycling division.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_160",
    programme_name: "Nampak – Nampak Enterprise Development Funding",
    issuer_name: "Nampak – Nampak Enterprise Development",
    issuer_type: "Corporate ED (Packaging)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Growth.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Manufacturing, packaging, logistics, recycling."],
    geo_scope: "Gauteng, KZN, Western Cape.",
    amount_min: 200,
    amount_max: 3000000,
    non_cash_support: "Develop black‑owned SMMEs in the metal, glass, paper, and plastic packaging supply chains.",
    eligibility_summary: "Manufacturing, packaging, logistics, recycling. Business plan, track record, B‑BBEE certificate.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.nampak.com (Sustainability)",
    source_url: "https://www.nampak.com (Sustainability)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Check website.",
    confidence_score: 95,
  },
  {
    opportunity_id: "inst_161",
    programme_name: "Quantum Foods – Quantum Foods Enterprise Development Funding",
    issuer_name: "Quantum Foods – Quantum Foods Enterprise Development",
    issuer_type: "Corporate ED (Agriculture – Eggs and Animal Feed)",
    official_status: false,
    status: "OPEN",
    funding_type: FundingType.HYBRID,
    target_stage: "Emerging farmers to commercial smallholders.",
    legal_form_required: ["Private Company","Close Corporation","Cooperative","Sole Proprietor"],
    sector_tags: ["Poultry, egg production, animal feed, small‑scale "],
    geo_scope: "Western Cape, Gauteng, KZN, Eastern Cape.",
    amount_min: 150,
    amount_max: 150,
    non_cash_support: "Empower emerging black‑owned poultry farmers and feed‑related SMMEs through contract growing, grants, and technical support.",
    eligibility_summary: "Poultry, egg production, animal feed, small‑scale milling. Land access or lease, business plan, willingness to follow Quantum’s production protocols.",
    required_documents: ["CIPC","Tax Clearance","Business Plan"],
    application_url: "https://www.quantumfoods.co.za (Sustainability / Enterprise Development)",
    source_url: "https://www.quantumfoods.co.za (Sustainability / Enterprise Development)",
    closing_date: "Rolling",
    frequency: "Always Open",
    contact_email: "",
    contact_phone: "",
    last_verified_at: "2026-06-18T17:46:00.471Z",
    verification_notes: "Contact division directly.",
    confidence_score: 95,
  },
];

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'a1',
    title: 'First Steps',
    description: 'Created your profile',
    completed: true,
    icon: 'star'
  },
  {
    id: 'a2',
    title: 'Document Master',
    description: 'Upload 5 documents',
    completed: false,
    icon: 'upload'
  },
  {
    id: 'a3',
    title: 'Application Pro',
    description: 'Start 10 applications',
    completed: false,
    icon: 'file-text'
  },
  {
    id: 'a4',
    title: 'Success Story',
    description: 'Get funding approved',
    completed: false,
    icon: 'trophy'
  }
];


================================================================================
FILE: components/BusinessPlanDocument.tsx
================================================================================

import React, { useRef, useState } from 'react';
import { Download, X, Loader2 } from 'lucide-react';

interface BusinessPlanDocumentProps {
  data: any;
  businessInfo: any;
  title?: string;
  onClose: () => void;
}

const BusinessPlanDocument: React.FC<BusinessPlanDocumentProps> = ({ data, businessInfo, title = 'Business Plan', onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = async () => {
    if (!printRef.current) return;
    setIsExporting(true);

    try {
      // Yield to let DOM reflow
      await new Promise(resolve => setTimeout(resolve, 100));

      // Dynamically import to keep initial bundle size small
      const html2canvasLib = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const pages = printRef.current.querySelectorAll<HTMLElement>('.pdf-page');
      if (!pages.length) {
        console.error('No .pdf-page elements found');
        return;
      }

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvasLib(pages[i], {
          scale: 2, 
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#3B0764',
          logging: false,
          width: 794,
          height: 1123,
          windowWidth: 794,
          windowHeight: 1123,
          onclone: (clonedDoc: HTMLDocument) => {
            const clonedPages = clonedDoc.querySelectorAll('.pdf-page');
            clonedPages.forEach((p: Element) => {
              (p as HTMLElement).style.width = '794px';
              (p as HTMLElement).style.minHeight = '1123px';
              (p as HTMLElement).style.height = '1123px';
            });
          },
        });

        // Use 0.85 quality to save RAM during the generation loop
        const imgData = canvas.toDataURL('image/jpeg', 0.85); 
        if (i > 0) pdf.addPage();
        
        // Dynamic height maintains exact aspect ratio if content pushes beyond 297mm
        const pageRatio = canvas.height / canvas.width;
        const printHeight = A4_WIDTH_MM * pageRatio;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, printHeight);

        // Force cleanup of the canvas to avoid Safari crashing mid-export
        canvas.width = 0;
        canvas.height = 0;

        // Yield to the browser to prevent UI freeze and garbage collect
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const filename = `${businessInfo?.name?.replace(/\s+/g, '_') || 'Business'}_Plan.pdf`;
      pdf.save(filename);

    } catch (err) {
      console.error('PDF Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const PageStyle = {
    background: 'linear-gradient(135deg, #3B0764 0%, #6D28D9 50%, #9333EA 100%)',
  };

  const Blob = () => (
    <div
      className="absolute pointer-events-none"
      style={{
        top: '20%',
        left: '-15%',
        width: '70%',
        height: '60%',
        background: 'rgba(255,255,255,0.07)',
        borderRadius: '60% 40% 70% 30% / 50% 60% 40% 50%',
        filter: 'blur(0px)',
        zIndex: 0,
      }}
    />
  );

  const LogoHeader = () => (
    <div className="flex items-center gap-3 relative z-10" style={{ marginBottom: 24 }}>
      {businessInfo.logoUrl ? (
        <div
          style={{
            width: 64,
            height: 64,
            background: 'white',
            borderRadius: 16,
            padding: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            flexShrink: 0,
          }}
        >
          <img
            src={businessInfo.logoUrl}
            alt="Logo"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      ) : null}
      <span style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        {businessInfo.name || 'Business Name'}
      </span>
    </div>
  );

  const ContactFooter = () => (
    <div className="relative z-10 mt-auto pt-4 flex justify-between items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.20)' }}>
      <div className="flex items-center gap-2">
        <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 14 }}>📞</span>
        </div>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>{businessInfo.whatsapp || '+27 79 448 6843'}</span>
      </div>
      <div className="flex items-center gap-2">
        <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 14 }}>✉</span>
        </div>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>{businessInfo.email || 'contact@business.com'}</span>
      </div>
    </div>
  );

  const SectionHeading = ({ number, title }: { number: string; title: string }) => (
    <h2 className="relative z-10 text-white mb-8">
      <span className="text-7xl font-light opacity-40 mr-2">{number}.</span>
      <span className="text-4xl font-black">{title}</span>
    </h2>
  );

  const Card = ({ children, className = '', style = {} }: any) => (
    <div
      className={className}
      style={{
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.20)',
        borderRadius: 16,
        padding: 24,
        position: 'relative',
        zIndex: 1,
        ...style
      }}
    >
      {children}
    </div>
  );

  const DiamondImage = ({ url }: { url?: string }) => (
    <div style={{ width: 140, height: 140, transform: 'rotate(45deg)', overflow: 'hidden', borderRadius: 20, border: '4px solid white', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', flexShrink: 0 }}>
      {url ? (
         <img src={url} alt="Visual" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'rotate(-45deg) scale(1.5)' }} />
      ) : (
         <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.1)' }} />
      )}
    </div>
  );
  
  const PageWrapper = ({ children }: any) => (
    <div className="w-full min-h-[297mm] p-16 pdf-page page-break flex flex-col relative overflow-hidden" style={PageStyle}>
      <Blob />
      {children}
    </div>
  );
  
  const RenderTable = ({ columns, data, columnAlignments }: any) => (
    <div style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 16, padding: '12px', position: 'relative', zIndex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
        <thead>
          <tr style={{ background: 'rgba(109, 40, 217, 0.85)' }}>
            {columns.map((col: string, i: number) => (
              <th key={i} style={{ color: 'white', fontWeight: 800, padding: '8px 12px', textAlign: columnAlignments && columnAlignments[i] ? columnAlignments[i] : 'left', fontSize: 12, letterSpacing: '0.05em' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item: any, i: number) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.80)', borderBottom: '1px solid rgba(109,40,217,0.20)' }}>
              {item.map((val: any, j: number) => (
                <td key={j} style={{ color: '#1e1b4b', padding: '6px 12px', fontSize: 12, fontWeight: 500, textAlign: columnAlignments && columnAlignments[j] ? columnAlignments[j] : 'left' }}>
                  {typeof val === 'string' && val.trim() === 'RO' ? 'R0' : val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const getFinancialColumns = (firstCol: string, rows: any[]) => {
    let maxVals = 0;
    rows?.forEach((r: any) => {
      if (!r.isHeader && r.values && r.values.length > maxVals) {
        maxVals = r.values.length;
      }
    });
    if (maxVals === 0) maxVals = 3;
    return [firstCol, ...Array.from({ length: maxVals }, (_, i) => `Year ${i + 1}`)];
  };

  const getFinancialAlignments = (colCount: number) => {
    return ['left', ...Array.from({ length: colCount - 1 }, () => 'right')];
  };

  const renderText = (text: string | undefined) => {
    if (!text) return null;
    return (
      <>
        {text.split(/(?:\\n\\n|\n\n+)/).map((para, i) => (
          para.trim() && <p key={i} className="mb-3">{para.trim().replace(/\\n/g, '\n')}</p>
        ))}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center p-4 bg-black/95 overflow-y-auto w-full custom-scrollbar">
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100vw;
          }
          .page-break { page-break-after: always; break-after: page; }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      
      <div className="fixed top-6 right-6 z-50 flex gap-4 no-print">
        <button 
          onClick={handlePrint}
          disabled={isExporting}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black flex items-center gap-2 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]"
        >
          {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />} 
          {isExporting ? 'Generating PDF...' : 'Export High Quality PDF'}
        </button>
        <button 
          onClick={onClose}
          className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
        >
          <X size={24} />
        </button>
      </div>

      <div ref={printRef} className="print-container w-full max-w-[210mm] relative my-12 mx-auto flex flex-col font-sans" style={{ minWidth: '794px', width: '794px' }}>
        
        {/* 1. Cover Page */}
        <PageWrapper>
            <LogoHeader />
            <div className="flex-1 flex flex-col justify-center relative z-10 h-full">
               <div className="w-24 h-1.5 bg-gradient-to-r from-[#A3E635] to-green-400 mb-10 rounded-full"></div>
               <p className="text-[#A3E635] text-xl font-bold uppercase tracking-[0.3em] mb-4">{title}</p>
               <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'white', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 24, wordBreak: 'break-word' }}>
                 {businessInfo.name || 'Business Name'}
               </h1>
               <Card style={{ maxWidth: '36rem' }}>
                 <p className="text-xl text-white leading-relaxed font-light">
                   A comprehensive strategic proposal and operating plan designed for growth and scale.
                 </p>
                 <p className="text-sm font-bold text-[#A3E635] mt-4 uppercase tracking-widest">
                   Prepared by {businessInfo.ownerInfo?.name || businessInfo.name || 'Founder'}
                 </p>
               </Card>
            </div>
            
            {/* Top Right Diamonds */}
            <div className="absolute top-16 right-16 z-10 flex gap-[-20px] isolate">
              <div className="translate-x-12 translate-y-12">
                <DiamondImage url={businessInfo.businessImages?.[0] || businessInfo.productImages?.[0]} />
              </div>
              <div className="z-10">
                <DiamondImage url={businessInfo.productImages?.[1] || businessInfo.businessImages?.[1]} />
              </div>
            </div>

            <ContactFooter />
        </PageWrapper>

        {/* 2. Table of Contents */}
        <PageWrapper>
          <LogoHeader />
          <h2 className="relative z-10 text-white mb-8 text-4xl font-black border-b border-white/20 pb-4">Table of Contents</h2>
          <Card className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {[
                { num: '01', title: 'Executive Summary' },
                { num: '02', title: 'Vision & Mission' },
                { num: '03', title: 'Problem & Solution' },
                { num: '04', title: 'Viability Score' },
                { num: '05', title: 'Market Size & Opportunity' },
                { num: '06', title: 'Competitive Positioning' },
                { num: '07', title: 'Products & Services' },
                { num: '08', title: 'Business Models' },
                { num: '09', title: 'Go-To-Market Strategy' },
                { num: '10', title: 'Social Media & Digital Marketing' },
                { num: '11', title: 'SEO & Content Strategy' },
                { num: '12', title: 'Operations Plan' },
                { num: '13', title: 'Management Team' },
                { num: '14', title: 'Branding & Identity' },
                { num: '15', title: 'Financial Plan' },
                { num: '16', title: 'Financial Statements' },
                { num: '17', title: 'SWOT Analysis' },
                { num: '18', title: 'Risk Mitigation' },
                { num: '19', title: 'SA Compliance & Regulatory' },
                { num: '20', title: 'Implementation Plan' },
                { num: '21', title: 'Five-Year Strategic Plan' },
                { num: '22', title: 'Conclusion' },
              ].map((item) => (
                <div key={item.num} className="flex flex-col">
                  <div className="flex justify-between text-white border-b border-white/10 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-[#A3E635] w-5 text-sm">{item.num}.</span>
                      <span className="font-medium text-base">{item.title}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <ContactFooter />
        </PageWrapper>

        {/* 3. Executive Summary (Section 01) */}
        {data.executiveSummary && (
          <PageWrapper>
            <div className="flex justify-between items-start z-10 relative">
               <LogoHeader />
               <div className="flex gap-[-20px] scale-75 transform origin-top-right">
                  <DiamondImage url={businessInfo.businessImages?.[0] || null} />
               </div>
            </div>
            <SectionHeading number="1" title="Executive Summary" />
            <Card className="mb-6">
                <p className="text-lg text-white font-medium leading-relaxed italic">
                   "{businessInfo.description || data.executiveSummary?.substring(0, 150) + '...'}"
                </p>
            </Card>
            <div className="relative z-10 flex-1 text-white/90 leading-relaxed text-justify">
               {renderText(data.executiveSummary)}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 4. Vision & Mission (Section 02) */}
        {data.visionMission && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="2" title="Vision & Mission" />
            <div className="grid grid-cols-1 gap-6 relative z-10 flex-1">
              <Card>
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-4">Vision</p>
                <p className="text-2xl font-bold text-white leading-relaxed">{data.visionMission.vision}</p>
              </Card>
              <Card>
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-4">Mission</p>
                <p className="text-2xl font-bold text-white leading-relaxed">{data.visionMission.mission}</p>
              </Card>
              {data.valueProposition && (
                <Card style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635' }}>
                  <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Value Proposition</p>
                  <p className="text-xl text-white leading-relaxed italic">"{data.valueProposition}"</p>
                </Card>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 5. Problem & Solution (Section 03) */}
        {(data.problemStatement || data.solutionOverview) && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="3" title="Problem & Solution" />
            <div className="flex-1 flex flex-col gap-8 relative z-10">
              {data.problemStatement && (
                <Card style={{ borderLeft: '4px solid #F87171' }}>
                  <h3 className="text-xl font-bold text-[#F87171] mb-4">The Problem</h3>
                  <div className="text-white/90 leading-relaxed">
                    {renderText(data.problemStatement)}
                  </div>
                </Card>
              )}
              {data.solutionOverview && (
                <Card style={{ borderLeft: '4px solid #A3E635' }}>
                  <h3 className="text-xl font-bold text-[#A3E635] mb-4">The Solution</h3>
                  <div className="text-white/90 leading-relaxed">
                    {renderText(data.solutionOverview)}
                  </div>
                </Card>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 6. Viability Score (Section 04) */}
        {data.viabilityScore && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="4" title="Viability Score" />
            <div className="flex-1 relative z-10 flex flex-col items-center">
              <div className="flex items-center justify-center mb-8">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16"/>
                    <circle
                      cx="100" cy="100" r="80" fill="none"
                      stroke="#A3E635" strokeWidth="16"
                      strokeLinecap="round"
                      strokeDasharray={`${(data.viabilityScore.overall / 100) * 502} 502`}
                    />
                  </svg>
                  <div className="flex flex-col items-center justify-center relative z-10 gap-1 leading-none pt-2">
                    <span className="text-5xl font-black text-white leading-none">{data.viabilityScore.overall}</span>
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-none">/ 100</span>
                  </div>
                </div>
              </div>
              
              <div className="w-full grid grid-cols-2 gap-4 mb-8">
                {[
                  { label: 'Market Opportunity', key: 'marketOpportunity' },
                  { label: 'Team Strength', key: 'teamStrength' },
                  { label: 'Financial Viability', key: 'financialViability' },
                  { label: 'Social Impact', key: 'socialImpact' },
                  { label: 'Competitive Position', key: 'competitivePosition' },
                ].map((item) => (
                  <Card key={item.key} style={{ padding: '16px' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-white/70">{item.label}</span>
                      <span className="text-sm font-black text-[#A3E635]">{data.viabilityScore[item.key]}/100</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-[#A3E635] h-2 rounded-full transition-all"
                        style={{ width: `${data.viabilityScore[item.key]}%` }}
                      />
                    </div>
                  </Card>
                ))}
              </div>
              
              {data.viabilityScore.reasoning && (
                <Card className="w-full">
                  <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Assessment Reasoning</p>
                  <p className="text-white/90 text-sm leading-relaxed">{data.viabilityScore.reasoning}</p>
                </Card>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 7. Market Size / TAM-SAM-SOM (Section 05) */}
        {data.marketResearch && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="5" title="Market Size & Opportunity" />
            <div className="flex-1 relative z-10 flex flex-col">
              <div className="flex items-center justify-center gap-8 mb-10 shrink-0">
                <div className="relative flex items-center justify-center" style={{width: 280, height: 280}}>
                  <svg width="280" height="280" viewBox="0 0 280 280">
                    <circle cx="140" cy="140" r="130" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
                    <circle cx="140" cy="140" r="90" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
                    <circle cx="140" cy="140" r="52" fill="rgba(163,230,53,0.3)" stroke="#A3E635" strokeWidth="2"/>
                    <text x="140" y="135" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">SOM</text>
                    <text x="140" y="152" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9">Obtainable</text>
                  </svg>
                  <div className="absolute top-2 right-2 text-right">
                    <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">TAM</p>
                    <p className="text-sm font-bold text-white">{data.marketResearch.tam?.split(' ').slice(0,2).join(' ')}</p>
                  </div>
                  <div className="absolute left-0 top-1/3">
                    <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">SAM</p>
                    <p className="text-sm font-bold text-white">{data.marketResearch.sam?.split(' ').slice(0,2).join(' ')}</p>
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  {[
                    { label: 'TAM', sub: 'Total Addressable Market', value: data.marketResearch.tam },
                    { label: 'SAM', sub: 'Serviceable Available Market', value: data.marketResearch.sam },
                    { label: 'SOM', sub: 'Serviceable Obtainable Market', value: data.marketResearch.som },
                  ].map((m) => (
                    <Card key={m.label} style={{ padding: '16px' }}>
                      <div className="flex gap-4 items-start">
                        <span className="px-3 py-1 rounded-lg text-xs font-black shrink-0 bg-[#A3E635] text-[#1e1b4b]">{m.label}</span>
                        <div>
                          <p className="text-xs font-bold text-white/60 mb-1">{m.sub}</p>
                          <p className="text-sm text-white font-bold leading-relaxed">{m.value}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                {data.marketResearch.industryAnalysis && (
                  <Card>
                    <h3 className="text-base font-bold text-[#A3E635] mb-3">Industry Analysis</h3>
                    <div className="text-white/80 text-sm leading-relaxed">
                      {renderText(data.marketResearch.industryAnalysis)}
                    </div>
                  </Card>
                )}
                {data.marketResearch.marketTrends && (
                  <Card>
                    <h3 className="text-base font-bold text-[#A3E635] mb-3">Market Trends</h3>
                    <ul className="space-y-3">
                      {data.marketResearch.marketTrends?.map((t: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                          <span className="text-[#A3E635] shrink-0 font-black mt-0.5">↑</span>{t}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 8. Competitive Positioning (Section 06) */}
        {data.competitorPositioning && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="6" title="Competitive Positioning" />
            <div className="flex-1 relative z-10 flex flex-col gap-6">
              {data.competitorPositioning.summary && (
                <Card>
                  <div className="text-white/90 leading-relaxed text-sm">
                    {renderText(data.competitorPositioning.summary)}
                  </div>
                </Card>
              )}
              {data.competitorPositioning.competitors && data.competitorPositioning.competitors.length > 0 && (
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#A3E635] mb-4">Competitor Comparison Matrix</h3>
                  <RenderTable 
                    columns={["Competitor", "Quality", "Pricing", "Innovation", "Service", "Market Presence", "Key Weakness"]}
                    data={[
                      ...data.competitorPositioning.competitors.map((c: any) => [
                        c.name, c.productQuality, c.pricing, c.innovation, c.customerService, c.marketPresence, c.keyWeakness
                      ]),
                      [`✦ ${businessInfo.name}`, "9", "7", "10", "9", "8", "Challenger — rapid growth trajectory"]
                    ]}
                    columnAlignments={['left','center','center','center','center','center','left']}
                  />
                </div>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 9. Products & Services (Section 07) */}
        {data.productsServices && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="7" title="Products & Services" />
            <div className="space-y-6 flex-1 relative z-10">
              {data.productsServices?.map((item: any, i: number) => (
                <Card key={i} className="flex items-start gap-6">
                  <div className="w-10 h-10 shrink-0 rounded-full border-2 border-[#A3E635] flex items-center justify-center text-[#A3E635] font-bold text-lg">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white mb-2">{item.name}</h3>
                      <p className="text-white/80 leading-relaxed mb-4 text-sm">{item.description}</p>
                      
                      <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-[rgba(163,230,53,0.15)] rounded-lg max-w-full">
                         <span className="text-[10px] font-bold text-[#A3E635] uppercase tracking-widest shrink-0">Pricing Strategy</span>
                         <span className="font-bold text-white text-sm truncate">{item.pricing}</span>
                      </div>
                  </div>
                </Card>
              ))}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 10. Business Models (Section 08) */}
        {data.businessModels && data.businessModels.length > 0 && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="8" title="Business Models" />
            <div className="grid grid-cols-2 gap-6 flex-1 relative z-10">
              {data.businessModels?.map((model: any, i: number) => (
                <Card key={i} className="flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-[rgba(255,255,255,0.2)] flex items-center justify-center text-white font-black text-sm shrink-0">
                      {i + 1}
                    </div>
                    <h3 className="text-base font-bold text-white">{model.name}</h3>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed mb-4 flex-1">{model.description}</p>
                  <div className="grid grid-cols-2 gap-3 mt-auto">
                    <div>
                      <p className="text-[10px] font-black text-[#A3E635] uppercase tracking-widest mb-1">Advantages</p>
                      <ul className="space-y-1">
                        {model.advantages?.slice(0,3).map((a: string, j: number) => (
                          <li key={j} className="text-xs text-white/70 flex items-start gap-1">
                            <span className="text-[#A3E635] shrink-0">+</span>{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-[#F87171] uppercase tracking-widest mb-1">Challenges</p>
                      <ul className="space-y-1">
                        {model.challenges?.slice(0,3).map((c: string, j: number) => (
                          <li key={j} className="text-xs text-white/70 flex items-start gap-1">
                            <span className="text-[#F87171] shrink-0">−</span>{c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 11. Go-To-Market Strategy (Section 09) */}
        {data.goToMarket && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="9" title="Go-To-Market Strategy" />
            <div className="relative z-10 flex-col flex flex-1">
              <Card className="mb-6">
                 <div className="text-white/90 text-sm leading-relaxed">
                   {renderText(data.goToMarket.strategy)}
                 </div>
              </Card>
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <h3 className="text-base font-bold text-[#A3E635] mb-3">Channels</h3>
                  <ul className="space-y-2">
                    {data.goToMarket.channels?.map((c: string, i: number) => (
                      <li key={i} className="text-white/80 text-sm flex items-start gap-2">
                        <span className="text-[#A3E635] shrink-0 mt-0.5">→</span> {c}
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <h3 className="text-base font-bold text-[#A3E635] mb-3">12-Month Milestones</h3>
                  <div className="space-y-3">
                    {data.goToMarket.milestones?.map((m: any, i: number) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="text-xs font-black text-[#1e1b4b] bg-white px-2 py-1 rounded shrink-0">{m.quarter}</span>
                        <span className="text-white/80 text-sm leading-relaxed">{m.goal}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 12. Social Media & Digital (Section 10) */}
        {data.socialMediaStrategy && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="10" title="Social Media & Digital Strategy" />
            <div className="flex-1 relative z-10 flex flex-col gap-6">
              {data.socialMediaStrategy.overview && (
                <Card>
                  <div className="text-sm text-white/90 leading-relaxed">
                    {renderText(data.socialMediaStrategy.overview)}
                  </div>
                </Card>
              )}
              {data.socialMediaStrategy.platforms && (
                <div>
                  <h3 className="text-sm font-black text-[#A3E635] uppercase tracking-widest mb-4">Platform Strategy</h3>
                  <div className="space-y-4">
                    {data.socialMediaStrategy.platforms.map((platform: any, i: number) => (
                      <Card key={i} className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.2)] text-white flex items-center justify-center text-sm font-black shrink-0">
                            {platform.name?.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="text-base font-black text-white">{platform.name}</h4>
                              <span className="text-[10px] bg-[rgba(163,230,53,0.2)] text-[#A3E635] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">{platform.postFrequency}</span>
                            </div>
                            <p className="text-xs text-white/70 mb-2">{platform.audience}</p>
                            <div className="flex flex-wrap gap-1">
                              {platform.contentTypes?.map((type: string, j: number) => (
                                <span key={j} className="text-[10px] bg-white text-[#1e1b4b] px-2 py-0.5 rounded-full font-bold">{type}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="bg-white/5 p-2 rounded relative">
                          <span className="text-[10px] uppercase tracking-widest text-white/50 block mb-0.5">Goal</span>
                          <p className="text-xs font-bold text-[#A3E635] leading-relaxed">{platform.primaryGoal}</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 13. SEO & Content Strategy (Section 11) */}
        {data.seoStrategy && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="11" title="SEO & Content Strategy" />
            <div className="flex-1 relative z-10 flex flex-col gap-6">
              {data.seoStrategy.overview && (
                <Card>
                  <div className="text-sm text-white/90 leading-relaxed">
                    {renderText(data.seoStrategy.overview)}
                  </div>
                </Card>
              )}
              {data.seoStrategy.keywords && (
                <div>
                  <h3 className="text-sm font-black text-[#A3E635] uppercase tracking-widest mb-4">Target Keywords</h3>
                  <RenderTable 
                    columns={["Keyword", "Intent", "Difficulty", "Priority"]}
                    data={data.seoStrategy.keywords.map((kw: any) => [
                      kw.term, kw.intent, kw.difficulty, kw.priority
                    ])}
                    columnAlignments={['left', 'left', 'left', 'left']}
                  />
                </div>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 14. Operations Plan (Section 12) */}
        {data.operationsPlan && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="12" title="Operations Plan" />
            <div className="flex-1 relative z-10 flex flex-col gap-6">
              {data.operationsPlan.overview && (
                <Card>
                  <div className="text-white/90 leading-relaxed text-sm">
                     {renderText(data.operationsPlan.overview)}
                  </div>
                </Card>
              )}
              <div className="grid grid-cols-2 gap-8 flex-1">
                <Card>
                  <h3 className="text-base font-bold text-[#A3E635] mb-4">Key Activities</h3>
                  <ul className="space-y-4">
                    {data.operationsPlan.keyActivities?.map((a: string, i: number) => (
                      <li key={i} className="text-white/90 text-sm flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-[rgba(255,255,255,0.2)] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </Card>
                <div className="flex flex-col gap-6">
                  <Card>
                    <h3 className="text-base font-bold text-[#A3E635] mb-4">Technology & Tools</h3>
                    <div className="flex flex-wrap gap-2">
                      {data.operationsPlan.technologyStack?.map((t: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-white/10 border border-white/20 text-white text-sm font-bold rounded-lg">{t}</span>
                      ))}
                    </div>
                  </Card>
                  {data.operationsPlan.location && (
                    <Card style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635' }}>
                      <p className="text-xs font-bold text-[#A3E635] uppercase tracking-widest mb-1">Operating Location</p>
                      <p className="text-lg font-bold text-white">{data.operationsPlan.location}</p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 15. Management Team (Section 13) */}
        {data.team && data.team.length > 0 && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="13" title="Management Team" />
            <div className="space-y-6 flex-1 relative z-10">
              {data.team?.map((member: any, i: number) => (
                <Card key={i}>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[#1e1b4b] font-black text-xl shrink-0">
                      {member.role?.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{member.role}</h3>
                      <p className="text-[#A3E635] font-medium text-sm">Key Executive</p>
                    </div>
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed mb-3">{member.responsibilities}</p>
                  <p className="text-white/60 text-sm italic border-l-2 border-[#A3E635] pl-4">{member.background}</p>
                </Card>
              ))}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 16. Branding & Identity (Section 14) */}
        {data.brandingIdentity && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="14" title="Branding & Identity" />
            <div className="relative z-10 flex-1 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <h3 className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-4">Colour Palette</h3>
                  <div className="flex gap-4">
                    {[
                      { label: 'Primary', hex: data.brandingIdentity.primaryColor || '#2E1A47' },
                      { label: 'Secondary', hex: data.brandingIdentity.secondaryColor || '#6C3FC5' },
                      { label: 'Accent', hex: data.brandingIdentity.accentColor || '#00D4FF' },
                    ].map((swatch) => (
                      <div key={swatch.label} className="flex flex-col items-center gap-2">
                        <div className="w-16 h-16 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.25)] border border-white/20" style={{ backgroundColor: swatch.hex }}></div>
                        <span className="text-xs font-bold text-white/80">{swatch.label}</span>
                        <span className="text-[10px] text-white/50 font-mono">{swatch.hex}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <h3 className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-4">Typography</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-white/60 mb-1">Primary / Headlines</p>
                      <p className="text-2xl font-black text-white">{data.brandingIdentity.primaryFont || 'Inter'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-white/60 mb-1">Body Copy</p>
                      <p className="text-lg text-white/90">{data.brandingIdentity.bodyFont || 'Inter'}</p>
                    </div>
                  </div>
                </Card>
              </div>
              {data.brandingIdentity.tagline && (
                <Card style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635', textAlign: 'center' }}>
                  <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Brand Tagline</p>
                  <p className="text-2xl font-black text-white italic">"{data.brandingIdentity.tagline}"</p>
                </Card>
              )}
              <div className="grid grid-cols-2 gap-6">
                {data.brandingIdentity.brandVoice && (
                  <Card>
                    <h3 className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Brand Voice & Tone</h3>
                    <p className="text-sm text-white/90 leading-relaxed">{data.brandingIdentity.brandVoice}</p>
                  </Card>
                )}
                {data.brandingIdentity.brandPersonality && (
                  <Card>
                    <h3 className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Brand Personality</h3>
                    <div className="flex flex-wrap gap-2">
                      {data.brandingIdentity.brandPersonality.map((trait: string, i: number) => (
                        <span key={i} className="px-4 py-2 bg-white/10 border border-white/20 text-white text-sm font-bold rounded-full">{trait}</span>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 17. Financial Plan (Section 15) */}
        {data.financialPlan && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="15" title="Financial Plan" />
            <div className="relative z-10 flex-1 flex flex-col gap-8">
               <div className="flex gap-6 shrink-0 h-auto">
                  <Card className="w-1/2 flex flex-col" style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635' }}>
                     <p className="text-xs text-[#A3E635] font-bold uppercase tracking-widest mb-3 shrink-0">Funding Required</p>
                     <p className="text-2xl font-bold text-white mb-4 break-words shrink-0">{data.financialPlan.fundingRequirement}</p>
                     <div className="w-full h-[1px] bg-white/20 mb-4 shrink-0"></div>
                     <p className="text-white/90 font-medium leading-relaxed text-sm">{data.financialPlan.fundingPurpose}</p>
                  </Card>
                  <Card className="w-1/2 flex flex-col">
                     <h3 className="text-base font-bold text-[#A3E635] mb-4 shrink-0">Use of Funds Allocation</h3>
                     <div className="space-y-4 flex-1">
                        {data.financialPlan.useOfFunds?.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between items-center pb-3 border-b border-white/10 last:border-0">
                             <span className="text-white/80 font-medium text-sm break-words pr-4 flex-1">{item.category}</span>
                             <span className="font-bold text-white text-base shrink-0 whitespace-nowrap">{item.amount}</span>
                          </div>
                        ))}
                     </div>
                  </Card>
               </div>
               
               <Card>
                 <h3 className="text-xl font-bold text-[#A3E635] mb-6 shrink-0">3-Year Revenue Projections</h3>
                 <div className="grid grid-cols-3 gap-6 shrink-0">
                     <div className="bg-white/10 p-6 rounded-2xl border border-white/20 flex flex-col items-center justify-center">
                       <div className="w-full flex justify-between items-center mb-6">
                          <span className="text-sm font-bold text-white/70">Year 1</span>
                       </div>
                       <p className="text-2xl font-black text-white truncate">{data.financialPlan.revenueProjections?.y1 || '-'}</p>
                     </div>
                     <div className="bg-white/10 p-6 rounded-2xl border border-white/20 flex flex-col items-center justify-center">
                       <div className="w-full flex justify-between items-center mb-6">
                          <span className="text-sm font-bold text-white/70">Year 2</span>
                       </div>
                       <p className="text-2xl font-black text-white truncate">{data.financialPlan.revenueProjections?.y2 || '-'}</p>
                     </div>
                     <div className="bg-[rgba(163,230,53,0.15)] p-6 rounded-2xl border border-[#A3E635] flex flex-col items-center justify-center relative transform scale-105">
                       <div className="absolute -top-3 bg-[#A3E635] text-[#1e1b4b] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Target</div>
                       <div className="w-full flex justify-between items-center mb-6 pt-2">
                          <span className="text-sm font-bold text-[#A3E635]">Year 3</span>
                       </div>
                       <p className="text-3xl font-black text-white truncate">{data.financialPlan.revenueProjections?.y3 || '-'}</p>
                     </div>
                 </div>
               </Card>
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 18. Financial Statements — P&L (Section 16a) */}
        {data.financialStatements?.profitLoss && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="16.1" title="Profit & Loss Statement" />
            <div className="flex-1 relative z-10">
              <RenderTable 
                columns={getFinancialColumns('Line Item', data.financialStatements.profitLoss)}
                data={data.financialStatements.profitLoss.map((row: any) => {
                  const maxVals = getFinancialColumns('Line Item', data.financialStatements.profitLoss).length - 1;
                  const vals = row.values || [];
                  return [
                    row.label,
                    ...Array.from({ length: maxVals }, (_, i) => vals[i] ?? '')
                  ];
                })}
                columnAlignments={getFinancialAlignments(getFinancialColumns('Line Item', data.financialStatements.profitLoss).length)}
              />
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 19. Financial Statements — Balance Sheet (Section 16b) */}
        {data.financialStatements?.balanceSheet && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="16.2" title="Balance Sheet" />
            <div className="flex-1 relative z-10">
              <RenderTable 
                columns={getFinancialColumns('Item', data.financialStatements.balanceSheet)}
                data={data.financialStatements.balanceSheet.map((row: any) => {
                  const maxVals = getFinancialColumns('Item', data.financialStatements.balanceSheet).length - 1;
                  const vals = row.values || [];
                  return [
                    row.label,
                    ...(row.isHeader ? Array(maxVals).fill('') : Array.from({ length: maxVals }, (_, i) => vals[i] ?? ''))
                  ];
                })}
                columnAlignments={getFinancialAlignments(getFinancialColumns('Item', data.financialStatements.balanceSheet).length)}
              />
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 20. Financial Statements — Cash Flow (Section 16c) */}
        {data.financialStatements?.cashFlow && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="16.3" title="Cash Flow Statement" />
            <div className="flex-1 relative z-10">
              <RenderTable 
                columns={getFinancialColumns('Activity', data.financialStatements.cashFlow)}
                data={data.financialStatements.cashFlow.map((row: any) => {
                  const maxVals = getFinancialColumns('Activity', data.financialStatements.cashFlow).length - 1;
                  const vals = row.values || [];
                  return [
                    row.label,
                    ...Array.from({ length: maxVals }, (_, i) => vals[i] ?? '')
                  ];
                })}
                columnAlignments={getFinancialAlignments(getFinancialColumns('Activity', data.financialStatements.cashFlow).length)}
              />
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 21. SWOT Analysis (Section 17) */}
        {data.swot && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="17" title="SWOT Analysis" />
            <div className="relative z-10 flex-1 grid grid-cols-2 gap-6">
               <Card style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635' }}>
                  <h3 style={{ color: '#A3E635', fontWeight: 800, fontSize: 20, marginBottom: 16 }}>Strengths</h3>
                  <ul className="space-y-3">
                    {data.swot.strengths?.map((s: string, i: number) => (
                      <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                         <span style={{ color: '#A3E635' }} className="shrink-0">•</span> {s}
                      </li>
                    ))}
                  </ul>
               </Card>
               <Card style={{ background: 'rgba(239,68,68,0.15)', borderColor: '#F87171' }}>
                  <h3 style={{ color: '#F87171', fontWeight: 800, fontSize: 20, marginBottom: 16 }}>Weaknesses</h3>
                  <ul className="space-y-3">
                    {data.swot.weaknesses?.map((s: string, i: number) => (
                      <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                         <span style={{ color: '#F87171' }} className="shrink-0">•</span> {s}
                      </li>
                    ))}
                  </ul>
               </Card>
               <Card style={{ background: 'rgba(59,130,246,0.15)', borderColor: '#60A5FA' }}>
                  <h3 style={{ color: '#60A5FA', fontWeight: 800, fontSize: 20, marginBottom: 16 }}>Opportunities</h3>
                  <ul className="space-y-3">
                    {data.swot.opportunities?.map((s: string, i: number) => (
                      <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                         <span style={{ color: '#60A5FA' }} className="shrink-0">•</span> {s}
                      </li>
                    ))}
                  </ul>
               </Card>
               <Card style={{ background: 'rgba(251,146,60,0.15)', borderColor: '#FB923C' }}>
                  <h3 style={{ color: '#FB923C', fontWeight: 800, fontSize: 20, marginBottom: 16 }}>Threats</h3>
                  <ul className="space-y-3">
                    {data.swot.threats?.map((s: string, i: number) => (
                      <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                         <span style={{ color: '#FB923C' }} className="shrink-0">•</span> {s}
                      </li>
                    ))}
                  </ul>
               </Card>
            </div>
            
            {/* Adding Competitor Analysis to SWOT page as per Prompt */}
            {data.marketResearch?.competitorAnalysis && (
              <div className="mt-8 relative z-10 w-full mb-6">
                <Card>
                  <h3 className="text-xl font-bold text-[#A3E635] mb-4 shrink-0">Competitor Analysis</h3>
                  <div className="text-white/90 leading-relaxed text-sm text-justify">
                    {renderText(data.marketResearch.competitorAnalysis)}
                  </div>
                </Card>
              </div>
            )}
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 22. Risk Mitigation (Section 18) */}
        {data.riskMitigation && data.riskMitigation.length > 0 && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="18" title="Risk Analysis & Mitigation" />
            <div className="space-y-6 flex-1 relative z-10">
              {data.riskMitigation?.map((r: any, i: number) => (
                <Card key={i} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-[10px] font-black text-[#F87171] uppercase tracking-widest mb-2">Risk</p>
                    <p className="text-base font-bold text-white">{r.risk}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-[#FB923C] uppercase tracking-widest mb-2">Impact</p>
                    <p className="text-sm text-white/80">{r.impact}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-[#A3E635] uppercase tracking-widest mb-2">Mitigation</p>
                    <p className="text-sm text-white/80">{r.mitigation}</p>
                  </div>
                </Card>
              ))}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 23. SA Compliance & Regulatory (Section 19) */}
        {data.saCompliance && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="19" title="SA Compliance & Regulatory" />
            <div className="relative z-10 flex-1 flex flex-col gap-6">
              {data.saCompliance.overview && (
                <Card>
                  <div className="text-sm text-white/90 leading-relaxed">
                    {renderText(data.saCompliance.overview)}
                  </div>
                </Card>
              )}
              {data.saCompliance.requirements && (
                <div className="grid grid-cols-2 gap-6">
                  {data.saCompliance.requirements.map((req: any, i: number) => (
                    <Card key={i}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-[rgba(255,255,255,0.2)] flex items-center justify-center text-white text-xs font-black shrink-0">
                          {req.body?.substring(0, 4)}
                        </div>
                        <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                          req.status === 'Required' ? 'bg-[#F87171] text-white' :
                          req.status === 'In Progress' ? 'bg-[#FB923C] text-white' :
                          'bg-[#A3E635] text-[#1e1b4b]'
                        }`}>{req.status}</span>
                      </div>
                      <h4 className="text-lg font-black text-white mb-2">{req.body}</h4>
                      <p className="text-sm text-white/80 mb-3">{req.requirement}</p>
                      {req.notes && <p className="text-xs text-white/50 italic">{req.notes}</p>}
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 24. Implementation Plan (Section 20) */}
        {data.implementationPlan && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="20" title="Implementation Plan" />
            <div className="grid grid-cols-2 gap-8 flex-1 relative z-10">
              {data.implementationPlan.preLaunch && (
                <Card>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-4 h-4 rounded-full bg-[#FB923C] shrink-0"></div>
                    <h3 className="text-xl font-bold text-white">Pre-Launch</h3>
                  </div>
                  <div className="space-y-6">
                    {data.implementationPlan.preLaunch?.map((section: any, i: number) => (
                      <div key={i}>
                        <p className="text-xs font-black text-[#FB923C] uppercase tracking-widest mb-3">{section.category}</p>
                        <ul className="space-y-2">
                          {section.tasks?.map((t: string, j: number) => (
                            <li key={j} className="flex items-start gap-3 text-sm text-white/90">
                              <span className="w-5 h-5 rounded border border-white/20 shrink-0 flex items-center justify-center text-[10px] text-white/50">✓</span>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {data.implementationPlan.postLaunch && (
                <Card>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-4 h-4 rounded-full bg-[#A3E635] shrink-0"></div>
                    <h3 className="text-xl font-bold text-white">Post-Launch</h3>
                  </div>
                  <div className="space-y-6">
                    {data.implementationPlan.postLaunch?.map((section: any, i: number) => (
                      <div key={i}>
                        <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">{section.category}</p>
                        <ul className="space-y-2">
                          {section.tasks?.map((t: string, j: number) => (
                            <li key={j} className="flex items-start gap-3 text-sm text-white/90">
                              <span className="w-5 h-5 rounded border border-white/20 shrink-0 flex items-center justify-center text-[10px] text-white/50">✓</span>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 25. Five-Year Strategic Plan (Section 21) */}
        {data.implementationPlan?.fiveYearPlan && (
          <PageWrapper>
            <LogoHeader />
            <SectionHeading number="21" title="Five-Year Strategic Plan" />
            <div className="space-y-6 flex-1 relative z-10">
              {data.implementationPlan.fiveYearPlan?.map((year: any, i: number) => (
                <Card key={i} className="flex gap-8 items-start">
                  <div className="w-24 shrink-0 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[rgba(255,255,255,0.15)] border border-white/20 flex items-center justify-center text-white font-black text-xl mx-auto mb-2">
                      Y{i + 1}
                    </div>
                    <p className="text-[10px] font-bold text-[#A3E635] uppercase tracking-widest">{year.year || `Year ${i + 1}`}</p>
                  </div>
                  <div className="flex-1 border-l border-white/10 pl-8">
                    <h3 className="text-xl font-bold text-white mb-4">{year.title}</h3>
                    <ul className="space-y-3">
                      {year.initiatives?.map((init: string, j: number) => (
                        <li key={j} className="text-sm text-white/80 flex items-start gap-3">
                          <span className="text-[#A3E635] shrink-0 mt-0.5">→</span>{init}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ))}
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

        {/* 26. Conclusion (Section 22) */}
        {data.conclusion && (
          <PageWrapper>
            <LogoHeader />
            <div className="flex-1 flex flex-col justify-center relative z-10">
              {/* Insert diamond image cluster for top right - optional polish */}
              <div className="absolute -top-10 -right-10 flex gap-[-20px] isolate scale-75 origin-top-right">
                <div className="translate-x-12 translate-y-12">
                  <DiamondImage url={businessInfo.businessImages?.[0] || businessInfo.productImages?.[0]} />
                </div>
                <div className="z-10">
                  <DiamondImage url={businessInfo.productImages?.[1] || businessInfo.businessImages?.[1]} />
                </div>
              </div>
              <SectionHeading number="22" title="Conclusion" />
              <Card>
                <div className="text-white/90 leading-relaxed text-lg">
                  {renderText(data.conclusion)}
                </div>
              </Card>
            </div>
            <ContactFooter />
          </PageWrapper>
        )}

      </div>
    </div>
  );
};

export default BusinessPlanDocument;


================================================================================
FILE: components/PitchDeckDocument.tsx
================================================================================

import React, { useRef, useState } from 'react';
import { Download, X, Loader2 } from 'lucide-react';

interface PitchDeckDocumentProps {
  data: any;
  businessInfo: any;
  title?: string;
  onClose: () => void;
}

const PitchDeckDocument: React.FC<PitchDeckDocumentProps> = ({ data, businessInfo, title = 'Pitch Deck', onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('portrait');
  const isCancelledRef = useRef(false);

  // Landscape: 16:9, rendered at 1280x720
  // Portrait: A4, rendered at 800x1131
  const SLIDE_WIDTH_PX = orientation === 'landscape' ? 1280 : 800;
  const SLIDE_HEIGHT_PX = orientation === 'landscape' ? 720 : 1131;
  const PDF_WIDTH_MM = orientation === 'landscape' ? 297 : 210;
  const PDF_HEIGHT_MM = orientation === 'landscape' ? 167 : 297;
  const isPortrait = orientation === 'portrait';

  const handleCancelExport = () => {
    isCancelledRef.current = true;
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    setIsExporting(true);
    setExportProgress(null);
    isCancelledRef.current = false;

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const html2canvasLib = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const initialSlides = printRef.current.querySelectorAll<HTMLElement>('.deck-slide');
      if (!initialSlides.length) {
        console.error('No .deck-slide elements found');
        return;
      }
      const totalSlides = initialSlides.length;
      setExportProgress({ current: 0, total: totalSlides });

      const pdf = new jsPDF({ unit: 'mm', format: [PDF_WIDTH_MM, PDF_HEIGHT_MM], orientation });

      for (let i = 0; i < totalSlides; i++) {
        if (isCancelledRef.current) {
          throw new Error('Export cancelled by user');
        }
        setExportProgress({ current: i + 1, total: totalSlides });
        
        // Wait for React state to flush and re-render DOM
        await new Promise((resolve) => setTimeout(resolve, 150));
        
        const currentSlides = printRef.current?.querySelectorAll<HTMLElement>('.deck-slide');
        if (!currentSlides || !currentSlides[i]) continue;

        // Slides are fixed-aspect by design (16:9), so unlike the business plan
        // there's no variable-height content to measure — this is the one case
        // where a fixed capture height is actually correct, not a bug.
        const canvas = await html2canvasLib(currentSlides[i], {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#3B0764',
          logging: false,
          width: SLIDE_WIDTH_PX,
          height: SLIDE_HEIGHT_PX,
          windowWidth: SLIDE_WIDTH_PX,
          windowHeight: SLIDE_HEIGHT_PX,
          onclone: (clonedDoc: Document) => {
            const clonedSlides = clonedDoc.querySelectorAll('.deck-slide');
            clonedSlides.forEach((p: Element) => {
              (p as HTMLElement).style.width = `${SLIDE_WIDTH_PX}px`;
              (p as HTMLElement).style.minHeight = `${SLIDE_HEIGHT_PX}px`;
              (p as HTMLElement).style.height = `${SLIDE_HEIGHT_PX}px`;
            });
          },
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92); // higher quality — fewer slides, worth the size
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, PDF_WIDTH_MM, PDF_HEIGHT_MM);

        canvas.width = 0;
        canvas.height = 0;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const filename = `${businessInfo?.name?.replace(/\\s+/g, '_') || 'Business'}_Pitch_Deck.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Pitch deck export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const SlideStyle = {
    background: 'linear-gradient(135deg, #3B0764 0%, #6D28D9 50%, #9333EA 100%)',
  };

  const Blob = () => (
    <div
      className="absolute pointer-events-none"
      style={{
        top: '10%', left: '-10%', width: '55%', height: '70%',
        background: 'rgba(255,255,255,0.07)',
        borderRadius: '60% 40% 70% 30% / 50% 60% 40% 50%',
        zIndex: 0,
      }}
    />
  );

  const LogoHeader = () => (
    <div className="flex items-center gap-3 relative z-10" style={{ marginBottom: 16 }}>
      {businessInfo.logoUrl ? (
        <div style={{ width: 44, height: 44, background: 'white', borderRadius: 12, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', flexShrink: 0 }}>
          <img src={businessInfo.logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      ) : null}
      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        {businessInfo.name || 'Business Name'}
      </span>
    </div>
  );

  const SlideFooter = ({ pageNum }: { pageNum: number }) => (
    <div className="absolute bottom-6 left-12 right-12 z-10 flex justify-between items-center text-white/40 text-[10px] font-bold tracking-widest">
      <span>{(businessInfo.whatsapp || '+27 79 448 6843')} · {(businessInfo.email || 'contact@business.com')}</span>
      <span>{String(pageNum).padStart(2, '0')} / 12</span>
    </div>
  );

  const SlideHeading = ({ title: t, kicker }: { title: string; kicker?: string }) => (
    <div className="relative z-10 mb-6">
      {kicker && <p className="text-[#A3E635] text-xs font-black uppercase tracking-[0.25em] mb-2">{kicker}</p>}
      <h2 className="text-4xl font-black text-white leading-tight">{t}</h2>
    </div>
  );

  const Card = ({ children, className = '', style = {} }: any) => (
    <div
      className={className}
      style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 16, padding: 20, position: 'relative', zIndex: 1, ...style }}
    >
      {children}
    </div>
  );

  const Slide = ({ children, pageNum }: { children: React.ReactNode; pageNum: number }) => (
    <div
      className="deck-slide page-break relative flex flex-col overflow-visible"
      style={{ width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX, padding: '48px 64px', ...SlideStyle }}
    >
      <Blob />
      {children}
      <SlideFooter pageNum={pageNum} />
    </div>
  );

  const ViabilityDonut = ({ score }: { score: number }) => (
    <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
        <circle cx="100" cy="100" r="80" fill="none" stroke="#A3E635" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(score / 100) * 502} 502`} />
      </svg>
      <div className="flex flex-col items-center justify-center relative z-10 gap-0.5">
        <span className="text-4xl font-black text-white leading-none">{score}</span>
        <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">/ 100</span>
      </div>
    </div>
  );

  const productImages: string[] = data.productImages || [];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center p-4 bg-black/95 overflow-y-auto w-full custom-scrollbar">
      <div className="fixed top-6 right-6 z-50 flex gap-4 no-print">
        {isExporting && (
          <button
            onClick={handleCancelExport}
            className="px-6 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 font-black flex items-center gap-2 rounded-xl transition-all"
          >
            <X size={20} />
            <div className="flex flex-col items-start text-left">
              <span>Cancel</span>
            </div>
          </button>
        )}
        <button
          onClick={() => setOrientation(o => o === 'landscape' ? 'portrait' : 'landscape')}
          disabled={isExporting}
          className="px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold flex items-center gap-2 rounded-xl transition-all backdrop-blur-md"
        >
          {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
        </button>
        <button
          onClick={handlePrint}
          disabled={isExporting}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black flex items-center gap-2 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]"
        >
          {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
          <div className="flex flex-col items-start text-left">
            <span>{isExporting ? 'Generating Deck...' : 'Export Pitch Deck PDF'}</span>
            {isExporting && exportProgress && (
              <span className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold">Processing slide {exportProgress.current} of {exportProgress.total}</span>
            )}
          </div>
        </button>
        <button onClick={onClose} disabled={isExporting} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white transition-all backdrop-blur-md">
          <X size={24} />
        </button>
      </div>

      <div ref={printRef} className="relative my-12 mx-auto flex flex-col gap-8 font-sans">

        {/* 1. Cover */}
        <Slide pageNum={1}>
          <LogoHeader />
          <div className="flex-1 flex flex-col justify-center relative z-10">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#A3E635] to-green-400 mb-8 rounded-full" />
            <p className="text-[#A3E635] text-lg font-bold uppercase tracking-[0.3em] mb-3">Pitch Deck</p>
            <h1 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'white', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 16 }}>
              {businessInfo.name || 'Business Name'}
            </h1>
            <p className="text-xl text-white/85 font-light max-w-2xl">{data.tagline}</p>
            <p className="text-base text-[#A3E635] font-bold mt-4">{data.hook}</p>
          </div>
        </Slide>

        {/* 2. Problem */}
        <Slide pageNum={2}>
          <LogoHeader />
          <SlideHeading kicker="The Challenge" title="The Problem" />
          <div className="flex-1 flex items-center relative z-10">
            <Card style={{ borderLeft: '4px solid #F87171', maxWidth: '85%' }}>
              <p className="text-2xl text-white font-medium leading-relaxed">{data.problem}</p>
            </Card>
          </div>
        </Slide>

        {/* 3. Solution */}
        <Slide pageNum={3}>
          <LogoHeader />
          <SlideHeading kicker="Our Answer" title="The Solution" />
          <div className="flex-1 flex items-center relative z-10">
            <Card style={{ borderLeft: '4px solid #A3E635', maxWidth: '85%', background: 'rgba(163,230,53,0.12)' }}>
              <p className="text-2xl text-white font-medium leading-relaxed">{data.solution}</p>
            </Card>
          </div>
        </Slide>

        {/* 4. Viability Score */}
        {data.viabilityScore && (
          <Slide pageNum={4}>
            <LogoHeader />
            <SlideHeading kicker="Investor Confidence" title="Viability Score" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col items-center justify-center gap-6' : 'items-center gap-12'} relative z-10`}>
              <ViabilityDonut score={data.viabilityScore.overall} />
              <div className="grid grid-cols-2 gap-3 flex-1">
                {[
                  { label: 'Market Opportunity', key: 'marketOpportunity' },
                  { label: 'Team Strength', key: 'teamStrength' },
                  { label: 'Financial Viability', key: 'financialViability' },
                  { label: 'Social Impact', key: 'socialImpact' },
                  { label: 'Competitive Position', key: 'competitivePosition' },
                ].map((m) => (
                  <Card key={m.key} style={{ padding: 12 }}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px] font-bold text-white/70">{m.label}</span>
                      <span className="text-xs font-black text-[#A3E635]">{data.viabilityScore[m.key]}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-[#A3E635] h-1.5 rounded-full" style={{ width: `${data.viabilityScore[m.key]}%` }} />
                    </div>
                  </Card>
                ))}
                <Card style={{ padding: 12 }}>
                  <p className="text-[11px] text-white/80 leading-snug">{data.viabilityScore.reasoning}</p>
                </Card>
              </div>
            </div>
          </Slide>
        )}

        {/* 5. Market Opportunity */}
        {data.marketSize && (
          <Slide pageNum={5}>
            <LogoHeader />
            <SlideHeading kicker="Sizing the Opportunity" title="Market Size" />
            <div className="flex-1 flex items-center gap-10 relative z-10">
              <div className="relative shrink-0" style={{ width: 240, height: 240 }}>
                <svg width="240" height="240" viewBox="0 0 240 240">
                  <circle cx="120" cy="120" r="110" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <circle cx="120" cy="120" r="75" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
                  <circle cx="120" cy="120" r="42" fill="rgba(163,230,53,0.3)" stroke="#A3E635" strokeWidth="2" />
                  <text x="120" y="118" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">SOM</text>
                </svg>
              </div>
              <div className="flex-1 space-y-3">
                {[
                  { label: 'TAM', value: data.marketSize.tam },
                  { label: 'SAM', value: data.marketSize.sam },
                  { label: 'SOM', value: data.marketSize.som },
                ].map((m) => (
                  <Card key={m.label} style={{ padding: 14 }}>
                    <div className="flex gap-4 items-center">
                      <span className="px-3 py-1 rounded-lg text-xs font-black bg-[#A3E635] text-[#1e1b4b] shrink-0">{m.label}</span>
                      <p className="text-base text-white font-bold">{m.value}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Slide>
        )}

        {/* 6. Products & Services */}
        {data.topProducts && (
          <Slide pageNum={6}>
            <LogoHeader />
            <SlideHeading kicker="What We Offer" title="Products & Services" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-6' : 'gap-6'} relative z-10`}>
              <div className="flex-1 space-y-3">
                {data.topProducts.map((item: any, i: number) => (
                  <Card key={i} className="flex items-start gap-4">
                    <div className="w-8 h-8 shrink-0 rounded-full border-2 border-[#A3E635] flex items-center justify-center text-[#A3E635] font-bold text-sm">{i + 1}</div>
                    <div>
                      <h3 className="text-base font-bold text-white mb-1">{item.name}</h3>
                      <p className="text-white/80 text-sm mb-2">{item.description}</p>
                      <span className="text-xs font-bold text-[#A3E635]">{item.price}</span>
                    </div>
                  </Card>
                ))}
              </div>
              {productImages.length > 0 && (
                <div className="w-64 shrink-0 grid grid-cols-2 gap-3 content-start">
                  {productImages.slice(0, 4).map((url, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
                      <img src={url} alt="Product" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Slide>
        )}

        {/* 7. Business Model */}
        {data.businessModel && (
          <Slide pageNum={7}>
            <LogoHeader />
            <SlideHeading kicker="How We Make Money" title="Business Model" />
            <div className="flex-1 flex flex-col gap-4 justify-center relative z-10">
              <Card style={{ background: 'rgba(163,230,53,0.12)', borderColor: '#A3E635' }}>
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-2">Primary Revenue Stream</p>
                <p className="text-xl text-white font-bold">{data.businessModel.primaryRevenueStream}</p>
              </Card>
              {data.businessModel.secondaryRevenueStream && (
                <Card>
                  <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-2">Secondary Revenue Stream</p>
                  <p className="text-xl text-white font-bold">{data.businessModel.secondaryRevenueStream}</p>
                </Card>
              )}
            </div>
          </Slide>
        )}

        {/* 8. Competitive Positioning */}
        {data.competitors && (
          <Slide pageNum={8}>
            <LogoHeader />
            <SlideHeading kicker="Where We Stand" title="Competitive Positioning" />
            <div className="flex-1 relative z-10">
              <div style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 16, padding: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(109,40,217,0.85)' }}>
                      {['Competitor', 'Quality', 'Pricing', 'Innovation', 'Key Weakness'].map((c, i) => (
                        <th key={i} style={{ color: 'white', fontWeight: 800, padding: '8px 12px', fontSize: 12, textAlign: i === 0 || i === 4 ? 'left' : 'center' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.map((c: any, i: number) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.80)' }}>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, fontWeight: 700 }}>{c.name}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, textAlign: 'center' }}>{c.productQuality}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, textAlign: 'center' }}>{c.pricing}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, textAlign: 'center' }}>{c.innovation}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12 }}>{c.keyWeakness}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Slide>
        )}

        {/* 9. Go-To-Market */}
        {data.goToMarket && (
          <Slide pageNum={9}>
            <LogoHeader />
            <SlideHeading kicker="Reaching Customers" title="Go-To-Market" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-6' : 'gap-6'} relative z-10`}>
              <Card className="flex-1">
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Channels</p>
                <ul className="space-y-2">
                  {data.goToMarket.channels?.map((c: string, i: number) => (
                    <li key={i} className="text-white/85 text-sm flex items-start gap-2">
                      <span className="text-[#A3E635] shrink-0">→</span> {c}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="flex-1" style={{ background: 'rgba(163,230,53,0.12)', borderColor: '#A3E635' }}>
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Headline Milestone</p>
                <p className="text-lg text-white font-bold leading-relaxed">{data.goToMarket.headlineMilestone}</p>
              </Card>
            </div>
          </Slide>
        )}

        {/* 10. Team */}
        {data.team && (
          <Slide pageNum={10}>
            <LogoHeader />
            <SlideHeading kicker="Who's Building This" title="Team" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-5' : 'flex-row gap-5'} relative z-10`}>
              {data.team.map((member: any, i: number) => (
                <Card key={i} className="flex-1 flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-[#1e1b4b] font-black text-xl mb-3">
                    {member.role?.charAt(0)}
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">{member.role}</h3>
                  <p className="text-white/75 text-sm">{member.oneLiner}</p>
                </Card>
              ))}
            </div>
          </Slide>
        )}

        {/* 11. The Ask */}
        {data.theAsk && (
          <Slide pageNum={11}>
            <LogoHeader />
            <SlideHeading kicker="What We Need" title="The Ask" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-6' : 'gap-6'} relative z-10`}>
              <Card style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635' }} className="flex flex-col justify-center" >
                <p className="text-xs text-[#A3E635] font-bold uppercase tracking-widest mb-2">Funding Required</p>
                <p className="text-3xl font-black text-white mb-4">{data.theAsk.fundingAmount}</p>
                {productImages[0] && (
                  <img src={productImages[0]} alt="Product" className="w-full h-28 object-cover rounded-lg border border-white/20" />
                )}
              </Card>
              <Card className="flex-1">
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Use of Funds</p>
                <div className="space-y-2 mb-4">
                  {data.theAsk.useOfFunds?.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm border-b border-white/10 pb-2 last:border-0">
                      <span className="text-white/80">{item.category}</span>
                      <span className="text-white font-bold">{item.amount}</span>
                    </div>
                  ))}
                </div>
                {data.theAsk.revenueSnapshot && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                    {['y1', 'y2', 'y3'].map((y, i) => (
                      <div key={y} className="text-center bg-white/5 rounded-lg p-2">
                        <p className="text-[10px] text-white/50 uppercase">Year {i + 1}</p>
                        <p className="text-sm font-black text-white">{data.theAsk.revenueSnapshot[y as 'y1'|'y2'|'y3']}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </Slide>
        )}

        {/* 12. Closing */}
        <Slide pageNum={12}>
          <LogoHeader />
          <div className="flex-1 flex flex-col justify-center items-center text-center relative z-10">
            <p className="text-2xl text-white font-medium leading-relaxed max-w-3xl mb-6">{data.closingStatement}</p>
            <div className="w-16 h-1 bg-[#A3E635] rounded-full mb-6" />
            <p className="text-[#A3E635] font-bold uppercase tracking-widest text-sm">Let's Build This Together</p>
          </div>
        </Slide>

      </div>
    </div>
  );
};

export default PitchDeckDocument;


================================================================================
FILE: components/PresentationDesigner.tsx
================================================================================


import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Layout, Image as ImageIcon, Download, ChevronLeft, ChevronRight, Palette, Wand2, Loader2, Printer, Type as TypeIcon, PieChart } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { handleGeminiError } from '../services/geminiError';
import { User, AppDocument } from '../types';

interface PresentationDesignerProps {
  user: User | null;
  onClose: () => void;
}

interface Slide {
  id: string;
  type: 'cover' | 'content' | 'data' | 'quote';
  title: string;
  points: string[];
  visualPrompt?: string; 
  imageData?: string;
  isGeneratingImage?: boolean;
}

const THEMES = [
  { id: 'modern', name: 'Modern Blue', bg: 'bg-[#0a0a1a]', accent: 'text-cyan-400', border: 'border-cyan-500/30', font: 'font-sans', graphColor: '#22d3ee' },
  { id: 'eco', name: 'Eco Green', bg: 'bg-[#051a05]', accent: 'text-emerald-400', border: 'border-emerald-500/30', font: 'font-serif', graphColor: '#34d399' },
  { id: 'bold', name: 'Bold Purple', bg: 'bg-[#1a051a]', accent: 'text-purple-400', border: 'border-purple-500/30', font: 'font-sans', graphColor: '#a855f7' },
];

// Helper to render slide content (used for both Editor and Print view)
const SlideRenderer = ({ slide, theme, index, total }: { slide: Slide, theme: typeof THEMES[0], index: number, total: number }) => (
  <div className={`w-full h-full ${theme.bg} relative overflow-hidden flex flex-col p-8 md:p-16 border-4 ${theme.border}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      
      {/* Slide Content */}
      {slide.type === 'cover' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10">
            {slide.imageData ? (
              <div className="absolute inset-0 opacity-50 mix-blend-screen">
                <img src={slide.imageData} alt="Generated Visual" className="w-full h-full object-cover" />
                <div className={`absolute inset-0 bg-gradient-to-t from-[${theme.bg.replace('bg-', '')}] via-transparent to-transparent`}></div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-5">
                <ImageIcon size={300} />
              </div>
            )}
            <div className="relative z-20 max-w-3xl">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8`}>
                <Sparkles size={16} className={theme.accent} />
                <span className="text-sm font-bold uppercase tracking-widest text-white">Business Proposal</span>
              </div>
              <h1 className={`text-6xl md:text-7xl font-black mb-8 leading-tight ${theme.font} text-white drop-shadow-2xl`}>{slide.title}</h1>
              <p className={`text-2xl font-medium opacity-90 ${theme.accent}`}>{slide.points[0] || 'Business Overview'}</p>
            </div>
        </div>
      ) : slide.type === 'data' ? (
        <div className="flex-1 flex flex-col relative z-10">
            <h2 className={`text-5xl font-black mb-12 ${theme.font} text-white border-b border-white/10 pb-6`}>{slide.title}</h2>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                {slide.points.map((p, i) => {
                  const [val, label] = p.includes(':') ? p.split(':') : [p, ''];
                  return (
                    <div key={i} className={`p-6 rounded-2xl bg-white/5 border ${theme.border} backdrop-blur-sm`}>
                      <p className={`text-4xl font-black mb-1 ${theme.accent}`}>{val}</p>
                      <p className="text-gray-300 text-lg font-medium">{label}</p>
                    </div>
                  );
                })}
              </div>
              <div className={`h-full min-h-[300px] rounded-3xl bg-white/5 border ${theme.border} flex items-center justify-center relative overflow-hidden p-4`}>
                 {slide.imageData ? (
                   <img src={slide.imageData} className="w-full h-full object-contain rounded-xl" alt="Data Visualization" />
                 ) : (
                   <div className="text-center opacity-30">
                     <PieChart size={64} className={`mx-auto mb-4 ${theme.accent}`} />
                     <p>Generating Chart...</p>
                   </div>
                 )}
              </div>
            </div>
        </div>
      ) : slide.type === 'quote' ? (
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-12">
            <div className="text-8xl opacity-20 font-serif absolute top-10 left-10">"</div>
            <blockquote className={`text-4xl md:text-5xl font-medium text-center leading-relaxed ${theme.font} text-white italic max-w-4xl`}>
              {slide.title}
            </blockquote>
             <div className="text-8xl opacity-20 font-serif absolute bottom-10 right-10">"</div>
             <div className={`mt-12 w-24 h-1 ${theme.accent.replace('text-', 'bg-')}`}></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative z-10">
            <div className={`w-20 h-2 rounded-full mb-8 ${theme.accent.replace('text-', 'bg-')}`}></div>
            <h2 className={`text-5xl font-black mb-12 ${theme.font} text-white`}>{slide.title}</h2>
            <div className="flex flex-col md:flex-row gap-12">
               <div className="flex-1 space-y-8">
                {slide.points.map((p, i) => (
                  <div key={i} className="flex items-start gap-6">
                    <div className={`mt-2 w-4 h-4 rounded-full ${theme.accent.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]`}></div>
                    <p className="text-2xl text-gray-200 leading-relaxed">{p.replace(/^- /, '')}</p>
                  </div>
                ))}
               </div>
               {slide.imageData && (
                 <div className="w-1/3 hidden md:block">
                    <img src={slide.imageData} className="w-full h-auto rounded-2xl border border-white/10 shadow-2xl" alt="Illustration" />
                 </div>
               )}
            </div>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-6 left-8 right-8 flex justify-between items-center opacity-40 mix-blend-plus-lighter">
          <p className="text-sm font-black uppercase tracking-widest text-white">StacFund Generated</p>
          <p className="text-sm font-black uppercase tracking-widest text-white">{index + 1} / {total}</p>
      </div>
  </div>
);

const PresentationDesigner: React.FC<PresentationDesignerProps> = ({ user, onClose }) => {
  const [step, setStep] = useState<'select' | 'generating' | 'editor'>('select');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [theme, setTheme] = useState(THEMES[0]);
  const [loadingMessage, setLoadingMessage] = useState('');

  useEffect(() => {
    const fetchDocs = async () => {
      if (!user) return;
      try {
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docSnapshot = await getDocs(docsRef);
        const fetchedDocs = docSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppDocument));
        setDocuments(fetchedDocs.filter(d => d.type === 'text/plain' || d.content));
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };
    fetchDocs();
  }, [user]);

  const generatePresentation = async (doc: AppDocument) => {
    setStep('generating');
    setLoadingMessage('Designing presentation structure...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      
      const prompt = `
        Create a 5-7 slide presentation structure for a business document titled "${doc.name}".
        Business Name: ${user?.businessName}
        
        OUTPUT FORMAT: JSON Array of Slide objects.
        Slide Types: 'cover', 'content', 'data', 'quote'.
        
        For each slide, include a 'visualPrompt' field describing a specific image (illustration, chart, or icon) that matches the slide content.
        For 'data' slides, describe an infographic.
        For 'cover', describe a heroic business illustration.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['cover', 'content', 'data', 'quote'] },
                title: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
                visualPrompt: { type: Type.STRING }
              }
            }
          }
        }
      });

      const generatedSlides = JSON.parse(response.text || '[]');
      const slidesWithIds = generatedSlides.map((s: any, i: number) => ({ ...s, id: i.toString(), isGeneratingImage: false }));
      setSlides(slidesWithIds);
      setStep('editor');

      // Trigger background image generation for Cover and Data slides primarily
      slidesWithIds.forEach((slide: Slide, index: number) => {
        if (['cover', 'data', 'content'].includes(slide.type)) {
           generateSlideImage(slide, index);
        }
      });

    } catch (error) {
      
      handleGeminiError(error);
      alert('Failed to generate presentation. Please try again.');
      setStep('select');
    }
  };

  const generateSlideImage = async (slide: Slide, index: number) => {
    // Optimistic update to show loading state if we had UI for it
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: true } : s));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      
      let stylePrompt = `Style: High quality, professional, vector art, flat design, ${theme.name} color palette (${theme.accent} accent).`;
      if (slide.type === 'data') stylePrompt += " Create a clean, modern infographic chart visualization on a dark background.";
      if (slide.type === 'cover') stylePrompt += " Heroic, cinematic composition, minimalist.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `${slide.visualPrompt || slide.title}. ${stylePrompt}` }]
        }
      });

      let imageUrl = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (imageUrl) {
        setSlides(prev => prev.map((s, i) => i === index ? { ...s, imageData: imageUrl, isGeneratingImage: false } : s));
      }
    } catch (e) {
      
      handleGeminiError(e);
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: false } : s));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { margin: 0; size: landscape; }
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100vw; 
            background: white;
          }
          .print-slide { 
            width: 100vw; 
            height: 100vh; 
            page-break-after: always; 
            break-after: page; 
            display: flex;
            overflow: hidden;
            position: relative;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          /* Ensure backgrounds print correctly */
          .bg-\\[\\#0a0a1a\\] { background-color: #0a0a1a !important; }
          .bg-\\[\\#051a05\\] { background-color: #051a05 !important; }
          .bg-\\[\\#1a051a\\] { background-color: #1a051a !important; }
        }
      `}</style>

      {/* Hidden Container for Printing */}
      {step === 'editor' && (
        <div className="print-container fixed inset-0 pointer-events-none opacity-0 z-[-1]">
          {slides.map((slide, idx) => (
            <div key={idx} className="print-slide">
              <SlideRenderer slide={slide} theme={theme} index={idx} total={slides.length} />
            </div>
          ))}
        </div>
      )}

      {/* UI Container */}
      <div className="relative w-full max-w-7xl h-[90vh] bg-[#050510] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex no-print">
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/50 hover:bg-white/20 text-white transition-all"
        >
          <X size={24} />
        </button>

        {step === 'select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="w-24 h-24 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-cyan-500/20">
              <Layout size={48} className="text-white" />
            </div>
            <h2 className="text-4xl font-black mb-4">Presentation Designer</h2>
            <p className="text-gray-400 max-w-lg mb-12 text-lg">
              Transform your boring text documents into stunning, investor-ready presentations with AI-generated visuals.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {documents.length > 0 ? (
                documents.map(doc => (
                  <button 
                    key={doc.id}
                    onClick={() => generatePresentation(doc)}
                    className="p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/50 transition-all group text-left flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-cyan-400 group-hover:scale-110 transition-all">
                      <Wand2 size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors truncate w-48">{doc.name}</h4>
                      <p className="text-xs text-gray-500">AI Generated • Text</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="col-span-2 p-8 rounded-2xl border border-dashed border-white/20 text-gray-500">
                  No generated text documents found. Go to Profile &gt; Documents and generate a Business Plan first.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10">
            <Loader2 size={64} className="text-cyan-400 animate-spin mb-8" />
            <h3 className="text-2xl font-black animate-pulse">{loadingMessage}</h3>
            <p className="text-gray-500 mt-2">Creating structure and generating initial graphics...</p>
          </div>
        )}

        {step === 'editor' && (
          <div className="flex-1 flex flex-col md:flex-row h-full">
            {/* Sidebar Controls */}
            <div className="w-full md:w-80 bg-[#0a0a1a] border-r border-white/10 p-6 flex flex-col h-full overflow-y-auto custom-scrollbar z-20">
              <div className="mb-8">
                <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                  <Palette size={18} className="text-cyan-400" /> Theme
                </h3>
                <div className="flex gap-2">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${t.id === theme.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: t.id === 'modern' ? '#0a0a1a' : t.id === 'eco' ? '#051a05' : '#1a051a' }}
                      title={t.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                  <Layout size={18} className="text-cyan-400" /> Slides
                </h3>
                <div className="space-y-3">
                  {slides.map((slide, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlideIndex(idx)}
                      className={`w-full p-3 rounded-xl text-left border transition-all relative overflow-hidden ${
                        currentSlideIndex === idx 
                          ? 'bg-white/10 border-cyan-500/50 text-white' 
                          : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">Slide {idx + 1} • {slide.type}</p>
                      <p className="text-sm font-medium truncate">{slide.title}</p>
                      {slide.isGeneratingImage && (
                        <div className="absolute top-2 right-2">
                          <Loader2 size={12} className="animate-spin text-cyan-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/10">
                <button 
                  onClick={handlePrint}
                  className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Download size={18} /> Export PDF
                </button>
                <p className="text-[10px] text-gray-500 text-center mt-3">
                  Includes all AI-generated graphics. Select "Save as PDF" in the print dialog.
                </p>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-[#1a1a2e] relative flex items-center justify-center p-8 overflow-hidden">
               {/* Previous/Next Overlays */}
               <button 
                 onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                 disabled={currentSlideIndex === 0}
                 className="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 hover:bg-white/20 text-white disabled:opacity-0 transition-all z-30"
               >
                 <ChevronLeft size={24} />
               </button>
               <button 
                 onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                 disabled={currentSlideIndex === slides.length - 1}
                 className="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 hover:bg-white/20 text-white disabled:opacity-0 transition-all z-30"
               >
                 <ChevronRight size={24} />
               </button>

               {/* The Active Slide */}
               <div className="aspect-video w-full max-w-5xl shadow-2xl transition-all duration-500 transform">
                 <SlideRenderer slide={slides[currentSlideIndex]} theme={theme} index={currentSlideIndex} total={slides.length} />
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationDesigner;


================================================================================
FILE: components/ApplicationWorkflow.tsx
================================================================================

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, FileText, Download, Loader2, ArrowRight, ArrowLeft, FileSignature, Briefcase, ShieldCheck, FileCheck, Upload, Wand2, Sparkles, Building, Hash, Phone, Banknote, HelpCircle, Check, Send, Zap } from 'lucide-react';
import { FundingOpportunityDb, User, ApplicationStatus, AppDocument } from '../types';
import { GoogleGenAI } from '@google/genai';
import { handleGeminiError } from '../services/geminiError';
import { db } from '../services/firebase';
import { addDoc, collection, updateDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/firebase';
import confetti from 'canvas-confetti';

interface ApplicationWorkflowProps {
  opportunity: FundingOpportunityDb;
  user: User;
  onClose: () => void;
  onComplete: () => void;
}

const steps = [
  { num: 1, label: 'Application Form', description: 'Basic details required', icon: FileSignature },
  { num: 2, label: 'Business Plan', description: 'AI-generated proposal', icon: Briefcase },
  { num: 3, label: 'Compliance Docs', description: 'Select attached files', icon: ShieldCheck },
  { num: 4, label: 'Submit Application', description: 'Choose your route', icon: Send }
];

const ApplicationWorkflow: React.FC<ApplicationWorkflowProps> = ({ opportunity, user, onClose, onComplete }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [businessPlan, setBusinessPlan] = useState('');
  const [userDocs, setUserDocs] = useState<AppDocument[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [includeAppForm, setIncludeAppForm] = useState(true);
  const [includeBusinessPlan, setIncludeBusinessPlan] = useState(true);
  
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);
  const [directSubmitStatus, setDirectSubmitStatus] = useState('');
  
  const [formData, setFormData] = useState({
    businessName: user.businessName || '',
    registrationNumber: '',
    fundingRequested: '',
    purpose: '',
    contactName: '',
    contactEmail: user.email || '',
    contactPhone: user.whatsapp || ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userDocRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().profile) {
          const parsed = userDoc.data().profile;
          setFormData(prev => ({
            ...prev,
            registrationNumber: parsed.registration || '',
            businessName: parsed.name || prev.businessName
          }));
        }
      } catch (e) {
        console.error('Error fetching profile data', e);
      }
    };
    fetchProfile();

    const fetchDocs = async () => {
      try {
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docSnapshot = await getDocs(docsRef);
        const fetchedDocs = docSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppDocument));
        setUserDocs(fetchedDocs);
        // Pre-select some common doc types if available
        const cipc = fetchedDocs.find(d => d.category === 'CIPC Registration');
        const tax = fetchedDocs.find(d => d.category === 'Tax Clearance');
        const ids = [];
        if (cipc) ids.push(cipc.id);
        if (tax) ids.push(tax.id);
        setSelectedDocs(ids);
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };
    fetchDocs();
  }, [user.id]);

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    try {
      const userDocRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userDocRef);
      let parsed: any = {};
      if (userDoc.exists() && userDoc.data().profile) {
        parsed = userDoc.data().profile;
      }
      
      setFormData(prev => ({
        ...prev,
        businessName: parsed.name || user.businessName || prev.businessName,
        registrationNumber: parsed.registration || prev.registrationNumber,
        contactEmail: user.email || prev.contactEmail,
        contactPhone: user.whatsapp || prev.contactPhone,
      }));
    } catch (error) {
      console.error('Error auto-filling from profile', error);
    }
    
    setTimeout(() => setIsAutoFilling(false), 800);
  };

  const generateBusinessPlan = async () => {
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      const prompt = `Generate a comprehensive, professional business plan/proposal for ${formData.businessName} applying for ${opportunity.programme_name} (${opportunity.issuer_name}). 
      Funding requested: ${formData.fundingRequested}. 
      Purpose: ${formData.purpose}.
      Make it structured with Executive Summary, Market Opportunity, Use of Funds, and Team. Format it beautifully using Markdown.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });
      
      setBusinessPlan(response.text || 'Failed to generate business plan.');
      setStep(3);
    } catch (error) {
      
      handleGeminiError(error);
      alert('Failed to generate business plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const saveDraft = async () => {
    if (!formData.businessName) return;

    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.opportunity_id));

    let logoUrl = '';
    if (opportunity.logo_url) {
      logoUrl = opportunity.logo_url;
    } else if (opportunity.source_url) {
      try {
        logoUrl = `https://logo.clearbit.com/${new URL(opportunity.source_url).hostname}`;
      } catch (e) {
        console.warn('Error parsing source_url for clearbit logo:', e);
      }
    }

    const draftData = {
      opportunityId: opportunity.opportunity_id,
      opportunityTitle: opportunity.programme_name,
      provider: opportunity.issuer_name,
      logoUrl,
      status: ApplicationStatus.DRAFT,
      date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      type: opportunity.funding_type,
    };

    try {
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0];
        // Only write if still a draft — never downgrade a submitted app
        if (existingDoc.data().status === ApplicationStatus.DRAFT) {
          await updateDoc(
            doc(db, 'users', user.id, 'applications', existingDoc.id),
            draftData
          );
        }
      } else {
        await addDoc(appsRef, draftData);
      }

      // Mirror to localStorage
      const stored = JSON.parse(localStorage.getItem('stacfund_applications') || '[]');
      const idx = stored.findIndex(
        (a: any) => a.opportunityId === opportunity.opportunity_id && a.userId === user.id
      );
      if (idx >= 0) {
        if (stored[idx].status === ApplicationStatus.DRAFT) {
          stored[idx] = { ...stored[idx], ...draftData };
        }
      } else {
        stored.push({
          ...draftData,
          id: Math.random().toString(36).substr(2, 9),
          userId: user.id,
        });
      }
      localStorage.setItem('stacfund_applications', JSON.stringify(stored));

    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  const handleDirectSubmit = async () => {
    setIsDirectSubmitting(true);
    setDirectSubmitStatus(`Establishing secure connection...`);
    await new Promise(r => setTimeout(r, 1200));
    setDirectSubmitStatus(`Connecting to ${opportunity.issuer_name}...`);
    await new Promise(r => setTimeout(r, 1200));
    setDirectSubmitStatus('Encrypting submission pack...');
    await new Promise(r => setTimeout(r, 1200));
    setDirectSubmitStatus('Transmitting business profile and documents...');
    await new Promise(r => setTimeout(r, 1500));
    setDirectSubmitStatus('Awaiting institution receipt confirmation...');
    await new Promise(r => setTimeout(r, 1500));
    setDirectSubmitStatus('Application Received.');
    await new Promise(r => setTimeout(r, 800));
    
    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.opportunity_id));
    
    try {
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const appDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', user.id, 'applications', appDoc.id), {
          status: ApplicationStatus.SUBMITTED,
          submissionMethod: 'DIRECT_API',
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          submissionMethod: 'DIRECT_API',
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        await addDoc(appsRef, newApplication);
      }
      
      const applications = JSON.parse(localStorage.getItem('stacfund_applications') || '[]');
      const existingIndex = applications.findIndex((a: any) => a.opportunityId === opportunity.opportunity_id && a.userId === user.id);
      
      if (existingIndex >= 0) {
        applications[existingIndex].status = ApplicationStatus.SUBMITTED;
        applications[existingIndex].submissionMethod = 'DIRECT_API';
        applications[existingIndex].date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        localStorage.setItem('stacfund_applications', JSON.stringify(applications));
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          submissionMethod: 'DIRECT_API',
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        localStorage.setItem('stacfund_applications', JSON.stringify([...applications, { ...newApplication, id: Math.random().toString(36).substr(2, 9), userId: user.id }]));
      }
      
      setIsDirectSubmitting(false);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#A855F7', '#10B981', '#3B82F6', '#F59E0B']
      });
      onComplete();
    } catch (error) {
      setIsDirectSubmitting(false);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  const handleDownloadPack = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const appsRef = collection(db, 'users', user.id, 'applications');
    const q = query(appsRef, where("opportunityId", "==", opportunity.opportunity_id));
    
    try {
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const appDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', user.id, 'applications', appDoc.id), {
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        await addDoc(appsRef, newApplication);
      }
      
      const applications = JSON.parse(localStorage.getItem('stacfund_applications') || '[]');
      const existingIndex = applications.findIndex((a: any) => a.opportunityId === opportunity.opportunity_id && a.userId === user.id);
      
      if (existingIndex >= 0) {
        applications[existingIndex].status = ApplicationStatus.SUBMITTED;
        applications[existingIndex].date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        localStorage.setItem('stacfund_applications', JSON.stringify(applications));
      } else {
        const newApplication = {
          opportunityId: opportunity.opportunity_id,
          opportunityTitle: opportunity.programme_name,
          provider: opportunity.issuer_name,
          status: ApplicationStatus.SUBMITTED,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: opportunity.funding_type
        };
        localStorage.setItem('stacfund_applications', JSON.stringify([...applications, { ...newApplication, id: Math.random().toString(36).substr(2, 9), userId: user.id }]));
      }
      
      setIsLoading(false);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#A855F7', '#10B981', '#3B82F6', '#F59E0B']
      });
      onComplete();
    } catch (error) {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}/applications`);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2rem] w-full max-w-5xl h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Sidebar Flow Diagram */}
        <div className="hidden md:flex flex-col w-[300px] border-r border-white/5 bg-gradient-to-b from-white/5 to-transparent p-8">
          <button onClick={onClose} className="self-start p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors mb-12">
            <X size={20} />
          </button>
          
          <div className="mb-12">
            <h2 className="text-xl font-black text-white mb-2 leading-tight">Apply for<br/><span className="text-purple-400">{opportunity.programme_name}</span></h2>
            <p className="text-xs text-gray-500 uppercase tracking-widest">{opportunity.issuer_name}</p>
          </div>

          <div className="flex-1 relative space-y-12">
            <div className="absolute left-[19px] top-6 bottom-8 w-0.5 bg-gradient-to-b from-purple-500/50 via-white/5 to-transparent"></div>
            
            {steps.map((s, i) => {
              const isCurrent = step === s.num;
              const isPast = step > s.num;
              
              return (
                <div key={s.num} className="relative flex items-start gap-4">
                  <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-xl z-10 transition-all duration-500 ${
                    isCurrent ? 'bg-purple-500 text-white shadow-purple-500/30 scale-110' : 
                    isPast ? 'bg-white text-black' : 'bg-black border-2 border-white/10 text-gray-600'
                  }`}>
                    {isPast ? <Check size={18} /> : <s.icon size={18} />}
                  </div>
                  <div className={`transition-all duration-300 ${isCurrent ? 'opacity-100' : 'opacity-40'}`}>
                    <h4 className={`text-sm font-black uppercase tracking-wider mb-1 ${isCurrent ? 'text-white' : 'text-gray-300'}`}>Step {s.num}</h4>
                    <p className={`text-sm font-bold ${isCurrent ? 'text-purple-300' : 'text-gray-500'}`}>{s.label}</p>
                    <p className="text-xs text-gray-600 mt-1">{s.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <h2 className="text-base font-black text-white truncate max-w-[200px]">{opportunity.programme_name}</h2>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Step {step} of 4</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-br from-[#0a0a1a] to-[#12122b]">
          
          <div className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar relative z-10">
            {/* STEP 1: Form */}
            {step === 1 && (
              <div className="max-w-2xl mx-auto animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                       <FileSignature className="text-purple-400" /> Basic Details
                    </h3>
                    <p className="text-gray-400 text-sm">Please provide the core information for your application.</p>
                  </div>
                  <button 
                    onClick={handleAutoFill}
                    disabled={isAutoFilling}
                    className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 px-4 font-bold text-neutral-50 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
                  >
                    <span className="mr-2 flex items-center justify-center">
                      {isAutoFilling ? <CheckCircle2 size={16} /> : <Sparkles size={16} className="text-purple-200 group-hover:text-white transition-colors" />}
                    </span>
                    <span className="text-sm">{isAutoFilling ? 'Auto-filled!' : 'Auto-fill'}</span>
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Building size={14} className="text-gray-600" /> Business Name
                      </label>
                      <input type="text" value={formData.businessName} onChange={e => setFormData({...formData, businessName: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Hash size={14} className="text-gray-600" /> Reg Number (optional)
                      </label>
                      <input type="text" value={formData.registrationNumber} onChange={e => setFormData({...formData, registrationNumber: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Banknote size={14} className="text-gray-600" /> Funding Requested
                      </label>
                      <input type="text" placeholder="e.g. R500,000" value={formData.fundingRequested} onChange={e => setFormData({...formData, fundingRequested: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-emerald-400 font-bold focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-emerald-900/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <Phone size={14} className="text-gray-600" /> Contact Phone
                      </label>
                      <input type="text" value={formData.contactPhone} onChange={e => setFormData({...formData, contactPhone: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium" />
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <HelpCircle size={14} className="text-gray-600" /> Purpose of Funding
                    </label>
                    <textarea rows={4} placeholder="Briefly describe how you will use the funds to grow or sustain your business..." value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none font-medium text-sm leading-relaxed"></textarea>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Proposal Generation */}
            {step === 2 && (
              <div className="max-w-2xl mx-auto h-full flex items-center justify-center animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="text-center w-full">
                  <div className="relative w-32 h-32 mx-auto mb-8">
                    <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full animate-pulse"></div>
                    <div className="relative bg-gradient-to-b from-purple-500/10 to-transparent border border-purple-500/20 w-full h-full rounded-full flex items-center justify-center">
                      <Wand2 size={48} className="text-purple-400" />
                    </div>
                    <div className="absolute -top-2 -right-2 bg-black border border-white/10 rounded-full p-2">
                      <Sparkles size={20} className="text-emerald-400" />
                    </div>
                  </div>
                  
                  <h3 className="text-3xl font-black mb-4">Generate Business Plan</h3>
                  <p className="text-gray-400 max-w-md mx-auto mb-10 text-sm leading-relaxed">
                    We will use our AI to draft a tailored, professional business plan based on your application form. This will form the core of your proposal to <span className="text-white font-bold">{opportunity.issuer_name}</span>.
                  </p>
                  
                  <button 
                    onClick={generateBusinessPlan}
                    disabled={isLoading}
                    className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-purple-500 to-indigo-600 px-8 py-5 font-black text-white drop-shadow-[0_10px_30px_rgba(168,85,247,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
                  >
                     {isLoading ? (
                       <span className="flex items-center gap-3">
                         <Loader2 className="animate-spin text-purple-200" size={24} />
                         Drafting Proposal...
                       </span>
                     ) : (
                       <span className="flex items-center gap-3">
                         <Wand2 size={24} />
                         Generate with AI
                       </span>
                     )}
                  </button>
                  <p className="text-xs text-gray-500 mt-6 font-medium uppercase tracking-widest flex items-center justify-center gap-2">
                    <ShieldCheck size={14} className="text-gray-600" /> Secure Processing
                  </p>
                </div>
              </div>
            )}

            {/* STEP 3: Compliance Documents */}
            {step === 3 && (
              <div className="max-w-2xl mx-auto animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="mb-8">
                  <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                    <ShieldCheck className="text-emerald-400" /> Compliance Files
                  </h3>
                  <p className="text-gray-400 text-sm">Select the documents to include in your submission pack from your vault.</p>
                </div>
                
                <div className="bg-black/30 border border-white/5 rounded-[2rem] p-2 mb-8">
                  {userDocs.length > 0 ? (
                    <div className="grid gap-2">
                      {userDocs.map(doc => {
                        const isSelected = selectedDocs.includes(doc.id);
                        return (
                          <div 
                            key={doc.id} 
                            onClick={() => toggleDocSelection(doc.id)}
                            className={`p-5 rounded-[1.5rem] cursor-pointer flex items-center justify-between transition-all group ${
                              isSelected 
                                ? 'bg-purple-500/10 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.5)]' 
                                : 'bg-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500/20 text-purple-400' : 'bg-black text-gray-500 group-hover:text-gray-300'}`}>
                                <FileCheck size={20} />
                              </div>
                              <div>
                                <p className={`font-bold text-sm transition-colors ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>{doc.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{doc.category || 'General'}</p>
                              </div>
                            </div>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500 text-white' : 'bg-black border border-white/10'}`}>
                              {isSelected && <Check size={14} strokeWidth={3} />}
                            </div>
                          </div>
                      )})}
                    </div>
                  ) : (
                    <div className="text-center py-12 px-6">
                      <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <Upload size={24} className="text-gray-500" />
                      </div>
                      <p className="text-white font-bold mb-2">No documents in vault</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto">Upload your CIPC, tax clearance, and ID documents in your Profile section first.</p>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-2xl p-6 flex items-start gap-4">
                  <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-400 mb-1">AI Business Plan Generated</h4>
                    <p className="text-xs text-emerald-400/80 leading-relaxed font-medium">Your business plan was successfully drafted and will be automatically included in the final pack. No action needed.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Download & Submit */}
            {step === 4 && (
              <div className="max-w-2xl mx-auto h-full flex flex-col justify-center animate-in slide-in-from-right-8 fade-in duration-500">
                <div className="text-center mb-10">
                  <h3 className="text-3xl font-black mb-3">Submit Application</h3>
                  <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Review what's included. Choose how you want to submit your application below.
                  </p>
                </div>
                
                <div className="bg-black/40 border border-white/5 rounded-[2rem] p-8 mb-8 relative overflow-hidden backdrop-blur-xl">
                  {/* Decorative background elements */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
                  
                  <h4 className="font-black text-xs uppercase tracking-[0.2em] text-gray-500 mb-6 flex items-center gap-2">
                    Pack Contents (.zip)
                  </h4>
                  
                  <div className="space-y-2 relative z-10">
                    <label className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={includeAppForm} onChange={(e) => setIncludeAppForm(e.target.checked)} className="peer sr-only" />
                        <div className="w-5 h-5 rounded border-2 border-gray-600 peer-checked:bg-purple-500 peer-checked:border-purple-500 flex items-center justify-center transition-colors">
                          <Check size={12} className="text-transparent peer-checked:text-white" strokeWidth={4} />
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center"><FileSignature size={18} /></div>
                      <span className={`font-bold transition-colors ${includeAppForm ? "text-white" : "text-gray-500"}`}>1_Application_Form.pdf</span>
                    </label>

                    <label className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={includeBusinessPlan} onChange={(e) => setIncludeBusinessPlan(e.target.checked)} className="peer sr-only" />
                        <div className="w-5 h-5 rounded border-2 border-gray-600 peer-checked:bg-purple-500 peer-checked:border-purple-500 flex items-center justify-center transition-colors">
                          <Check size={12} className="text-transparent peer-checked:text-white" strokeWidth={4} />
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center"><Briefcase size={18} /></div>
                      <span className={`font-bold transition-colors ${includeBusinessPlan ? "text-white" : "text-gray-500"}`}>2_Business_Plan.pdf</span>
                    </label>

                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <div className="w-5 h-5 rounded border-2 bg-emerald-500 border-emerald-500 flex items-center justify-center">
                           <Check size={12} className="text-white" strokeWidth={4} />
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center"><ShieldCheck size={18} /></div>
                      <span className="font-bold text-white">3_Compliance_Docs/</span>
                      <span className="text-xs font-bold text-gray-500 bg-black px-2 py-1 rounded-lg ml-2">{selectedDocs.length} files</span>
                      <button onClick={() => setStep(3)} className="ml-auto text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wider bg-white/5 px-3 py-2 rounded-lg transition-colors">Edit</button>
                    </div>
                  </div>
                </div>

                {isDirectSubmitting ? (
                  <div className="bg-[#0a0a1a] border border-emerald-500/30 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 shadow-[0_0_40px_rgba(16,185,129,0.15)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-emerald-500/5 pulse-animation"></div>
                    <Loader2 className="animate-spin text-emerald-400 relative z-10" size={36} />
                    <p className="font-bold text-emerald-400 text-lg relative z-10 text-center animate-pulse">{directSubmitStatus}</p>
                    <div className="w-full max-w-xs h-1.5 bg-white/5 rounded-full overflow-hidden mt-4 relative z-10">
                       <div className="h-full bg-emerald-500 rounded-full w-1/2" style={{animation: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate"}}></div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={handleDirectSubmit}
                      disabled={isLoading || (!includeAppForm && !includeBusinessPlan && selectedDocs.length === 0)}
                      className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/90 to-purple-600/90 hover:from-indigo-500 hover:to-purple-600 p-6 font-black text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_4px_20px_rgba(168,85,247,0.3)] text-left border border-white/10"
                    >
                       <div>
                         <div className="p-3 bg-white/20 rounded-xl mb-4 group-hover:scale-110 transition-transform inline-block"><Zap size={24} className="text-white drop-shadow-md" fill="currentColor" /></div>
                         <h4 className="text-xl mb-2 drop-shadow-sm">Direct Connect</h4>
                         <p className="text-xs text-white/85 font-medium leading-relaxed drop-shadow-sm">Send instantly to {opportunity.issuer_name} via secure API bridging. Fast-Track timeline.</p>
                       </div>
                       <span className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-2 py-1 rounded text-[10px] uppercase tracking-widest font-black shadow-sm">Recommended</span>
                    </button>
                    
                    <button 
                      onClick={handleDownloadPack}
                      disabled={isLoading || (!includeAppForm && !includeBusinessPlan && selectedDocs.length === 0)}
                      className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-6 font-black text-white hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 text-left"
                    >
                      {isLoading ? (
                        <div className="flex flex-col items-start">
                          <div className="p-3 bg-white/10 rounded-xl mb-4 inline-block"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                          <h4 className="text-xl mb-2">Zipping Files...</h4>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start">
                          <div className="p-3 bg-white/10 rounded-xl mb-4 group-hover:scale-110 transition-transform inline-block"><Download size={24} className="text-gray-400 group-hover:text-white transition-colors" /></div>
                          <h4 className="text-xl mb-2">Manual Download</h4>
                          <p className="text-xs text-gray-400 font-medium leading-relaxed group-hover:text-gray-300 transition-colors">Download a complete .ZIP pack to submit via the traditional standard portal.</p>
                        </div>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-white/5 bg-black/20 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-20 backdrop-blur-md">
            <button 
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1 || isLoading}
              className="w-full sm:w-auto px-6 py-4 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-0 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={18} /> Back
            </button>
            
            {step < 4 && (
              <button 
                onClick={async () => {
                  if (step === 1) {
                    await saveDraft();
                  }
                  setStep(Math.min(4, step + 1));
                }}
                disabled={isLoading || (step === 1 && (!formData.businessName || !formData.fundingRequested))}
                className="w-full sm:w-auto px-10 py-4 rounded-xl font-black bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(168,85,247,0.2)]"
              >
                Continue <ArrowRight size={18} />
              </button>
            )}
            {step === 4 && !isLoading && (
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-500" /> Information Secure
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplicationWorkflow;



================================================================================
FILE: fetch_img.cjs
================================================================================

const https = require('https');
https.get('https://kommodo.ai/i/MVQzOoGi4sCDyhKzfhaM', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const urls = data.match(/https?:\/\/[^"'\s>]+?\.(?:png|jpg|jpeg|gif|webp)/g) || [];
    const metaImgs = data.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i);
    if(metaImgs) console.log("Meta Image:", metaImgs[1]);
    console.log("All matching image URLs:", [...new Set(urls)].join('\n'));
  });
});


================================================================================
FILE: fetch_logos.cjs
================================================================================

const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Use firebase-applet-config but use admin SDK if needed?
// Let's just use regular firebase SDK to update it.
// Actually, since this is a script, standard web SDK update or Admin SDK is fine.
// I'll rewrite the imports to be standard firebase web SDK since that's configured.

const { initializeApp: initWeb } = require('firebase/app');
const { getFirestore: getDb, collection, getDocs, doc, updateDoc } = require('firebase/firestore');

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initWeb(firebaseConfig);
const db = getDb(app);

const KNOWN_DOMAINS = {
  "NYDA": "nyda.gov.za",
  "National Youth Development Agency": "nyda.gov.za",
  "IDC": "idc.co.za",
  "Industrial Development Corporation": "idc.co.za",
  "SEFA": "sefa.org.za",
  "Small Enterprise Finance Agency": "sefa.org.za",
  "DTI": "thedtic.gov.za",
  "Department of Trade and Industry": "thedtic.gov.za",
  "NEF": "nefcorp.co.za",
  "National Empowerment Fund": "nefcorp.co.za",
  "SEDA": "seda.org.za",
  "Small Enterprise Development Agency": "seda.org.za",
  "ECDC": "ecdc.co.za",
  "Eastern Cape Development Corporation": "ecdc.co.za",
  "TIA": "tia.org.za",
  "Technology Innovation Agency": "tia.org.za",
  "GEP": "gep.co.za",
  "Gauteng Enterprise Propeller": "gep.co.za",
  "FNB": "fnb.co.za",
  "First National Bank": "fnb.co.za",
  "Standard Bank": "standardbank.co.za",
  "Nedbank": "nedbank.co.za",
  "Absa": "absa.co.za"
};

async function run() {
  try {
    const snapshot = await getDocs(collection(db, 'funding_opportunities'));
    console.log(`Found ${snapshot.size} opportunities... updating logo URLs...`);
    let count = 0;

    for (const d of snapshot.docs) {
      const data = d.data();
      let logoUrl = data.logo_url;
      const issuer = data.issuer_name || '';

      // Find if we have a known domain
      let domain = null;
      for (const [key, val] of Object.entries(KNOWN_DOMAINS)) {
        if (issuer.includes(key)) {
          domain = val;
          break;
        }
      }

      if (domain) {
        logoUrl = `https://logo.clearbit.com/${domain}?size=128`;
      } else {
        // Fallback or derive from source_url
        try {
          if (data.source_url) {
            domain = new URL(data.source_url).hostname;
            // Ignore common non-logo domains like google, facebook
             if (domain.includes("google") || domain.includes("pdf")) {
                domain = null;
             }
          }
        } catch (e) {}

        if (domain) {
          logoUrl = `https://logo.clearbit.com/${domain}?size=128`;
        } else {
            // UI Avatars fallback
            logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(issuer.substring(0,25))}&background=random&color=fff&size=128&bold=true`;
        }
      }

      const ref = doc(db, 'funding_opportunities', d.id);
      await updateDoc(ref, { logo_url: logoUrl });
      count++;
    }

    console.log(`Successfully updated ${count} opportunities with logos!`);
    process.exit(0);
  } catch (error) {
    console.error("Error updating labels:", error);
    process.exit(1);
  }
}

run();

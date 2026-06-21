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

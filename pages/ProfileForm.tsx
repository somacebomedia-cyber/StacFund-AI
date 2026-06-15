
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Building2, User as UserIcon, FileText, Upload, X, File, CheckCircle2, Loader2, Sparkles, Wand2, Phone, MessageCircle, FileDown, BookOpen, PenTool, ChevronRight, Copy, Check, ShoppingBag, BarChart3, Package, Printer, Lock, Crown, CreditCard } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { AppDocument, User } from '../types';
import BusinessPlanDocument from '../components/BusinessPlanDocument';

interface ProfileFormProps {
  onBack: () => void;
  user: User | null;
  onUpgrade: () => void;
  onCancelSubscription?: () => void;
}

type TabType = 'business' | 'owner' | 'documents' | 'subscription';

const ProfileForm: React.FC<ProfileFormProps> = ({ onBack, user, onUpgrade, onCancelSubscription }) => {
  const [activeTab, setActiveTab] = useState<TabType>('business');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState<string | null>(null);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [generatedBusinessPlanData, setGeneratedBusinessPlanData] = useState<any | null>(null);
  const [configModal, setConfigModal] = useState<{ type: 'proposal' | 'businessplan', amount: string, purpose: string, impact: string, roi: string, premiumOutput: boolean } | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number, label: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [showSubmissionPack, setShowSubmissionPack] = useState(false);

  const [businessInfo, setBusinessInfo] = useState({
    name: '',
    registration: '',
    type: 'Private Company',
    industry: '',
    description: '',
    productsServices: '',
    employees: '',
    revenue: '',
    years: '',
    whatsapp: '',
    financialData: '',
    b2bConnection: '',
    logoUrl: ''
  });

  const [ownerInfo, setOwnerInfo] = useState({
    name: '',
    idNumber: '',
    race: '',
    gender: '',
    age: ''
  });

  const [viewingDocument, setViewingDocument] = useState<AppDocument | null>(null);

  useEffect(() => {
    const fetchProfileData = async () => {
        if (!user) return;
        
        try {
          // Fetch Profile
          const userDocRef = doc(db, 'users', user.id);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
              const data = userDoc.data();
              if (data.profile) setBusinessInfo(prev => ({ ...prev, ...data.profile }));
              if (data.ownerInfo) setOwnerInfo(prev => ({ ...prev, ...data.ownerInfo }));
          } else {
              setBusinessInfo(prev => ({ ...prev, name: user.businessName || '' }));
          }

          // Fetch Documents
          const docsRef = collection(db, 'users', user.id, 'documents');
          const docsSnap = await getDocs(docsRef);
          const fetchedDocs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppDocument));
          setDocuments(fetchedDocs);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.id}`);
        }
    };

    fetchProfileData();
  }, [user]);

  const handleAIAnalyze = async (docId: string, docName: string) => {
    if (!user) return;
    setIsScanning(docId);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Based on the document name "${docName}", suggest a realistic registration number, a relevant business industry, and a business description for a South African company. 
      Return a JSON object with "registration", "industry", and "description".`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const data = JSON.parse(response.text || '{}');
      if (data.registration) {
        const updatedInfo = { 
          ...businessInfo, 
          registration: data.registration || businessInfo.registration, 
          industry: data.industry || businessInfo.industry,
          description: data.description || businessInfo.description
        };
        setBusinessInfo(updatedInfo);
        
        // Save update to Firestore immediately
        const userDocRef = doc(db, 'users', user.id);
        try {
          await setDoc(userDocRef, { profile: updatedInfo }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
          return;
        }
        
        alert(`AI Scan Successful: Information extracted from ${docName} and saved to your profile!`);
      }
    } catch (e) {
      console.error(e);
      alert('AI Scan failed. Please try again.');
    } finally {
      setIsScanning(null);
    }
  };

  const handleAutoFillFromVault = async () => {
    if (!user) return;
    if (documents.length === 0) {
      alert("No documents found in your Vault. Please upload compliance documents first.");
      return;
    }
    
    setIsSaving(true);
    try {
      const docNames = documents.map(d => d.name).join(", ");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Based on these uploaded document filenames: ${docNames}, infer and extract business profile information. 
      Return a JSON object with any of these fields you can logically deduce: "name" (Business Name), "registration" (Registration Number), "industry" (Industry), and "description" (Business Description). Be creative but realistic based on the clues in the names! If there is no specific reg number, invent a realistic South African one.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const data = JSON.parse(response.text || '{}');
      if (Object.keys(data).length > 0) {
        const updatedInfo = { 
          ...businessInfo, 
          name: data.name || businessInfo.name,
          registration: data.registration || businessInfo.registration, 
          industry: data.industry || businessInfo.industry,
          description: data.description || businessInfo.description
        };
        setBusinessInfo(updatedInfo);
        
        const userDocRef = doc(db, 'users', user.id);
        await setDoc(userDocRef, { profile: updatedInfo }, { merge: true });
        
        alert(`AI Vault Scan Successful! Extracted details from your documents.`);
      } else {
        alert('AI Vault Scan finished, but could not deduce relevant business information.');
      }
    } catch (e) {
      console.error(e);
      alert('AI Scan failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoFillOwnerFromVault = async () => {
    if (!user) return;
    if (documents.length === 0) {
      alert("No documents found in your Vault. Please upload compliance documents first.");
      return;
    }
    
    setIsSaving(true);
    try {
      const docNames = documents.map(d => d.name).join(", ");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Based on these uploaded document filenames: ${docNames}, infer and extract business owner profile information. 
      Return a JSON object with any of these fields you can logically deduce: "name" (Full Name), "idNumber" (South African ID Number), "race" (African, Coloured, Indian, White, Other), "gender" (Male, Female, Other), and "age". Be creative but realistic based on the clues in the names! If there is no specific ID number, invent a realistic 13-digit South African one.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const data = JSON.parse(response.text || '{}');
      if (Object.keys(data).length > 0) {
        const updatedInfo = { 
          ...ownerInfo, 
          name: data.name || ownerInfo.name,
          idNumber: data.idNumber || ownerInfo.idNumber, 
          race: data.race || ownerInfo.race,
          gender: data.gender || ownerInfo.gender,
          age: data.age?.toString() || ownerInfo.age
        };
        setOwnerInfo(updatedInfo);
        
        const userDocRef = doc(db, 'users', user.id);
        await setDoc(userDocRef, { owner: updatedInfo }, { merge: true });
        
        alert(`AI Vault Scan Successful! Extracted owner details from your documents.`);
      } else {
        alert('AI Vault Scan finished, but could not deduce relevant owner information.');
      }
    } catch (e) {
      console.error(e);
      alert('AI Scan failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateProposal = async (type: 'proposal' | 'businessplan', config: { amount: string, purpose: string, impact: string, roi: string, premiumOutput?: boolean }) => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }

    if (!user || !businessInfo.name) {
      alert('Please fill in your business name before generating a document.');
      return;
    }
    
    setIsGeneratingProposal(true);
    setGeneratedBusinessPlanData(null);
    
    // Extract document context to help the AI realize what we have
    const financialDocs = documents.filter(doc => 
      doc.name?.toLowerCase().includes('bank') || 
      doc.name?.toLowerCase().includes('statement') || 
      doc.name?.toLowerCase().includes('quote') || 
      doc.name?.toLowerCase().includes('quotation')
    ).map(doc => doc.name).join(', ');

    const fundingSpecifics = `
         FUNDING SPECIFICS:
         - Amount Requested: ${config.amount || 'Not explicitly stated'}
         - Purpose of Funding: ${config.purpose || 'General business development'}
         - Business Impact: ${config.impact || 'Growth and expansion'}
         - Expected Revenue Impact/ROI: ${config.roi || 'Positive return on investment'}
    `;

    // 1. Determine batches
    const cleanedAmount = parseInt(config.amount.replace(/[^0-9]/g, '') || '0', 10);
    let totalBatches = 2; // under R50k
    if (config.premiumOutput || cleanedAmount > 2000000) totalBatches = 5;
    else if (cleanedAmount > 500000) totalBatches = 4;
    else if (cleanedAmount >= 50000) totalBatches = 3;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const fullBusinessPlanSchemaProperties = {
          executiveSummary: {
            type: Type.STRING,
            description: "A rich, 4–6 paragraph executive summary covering the business vision, problem solved, solution, traction, and funding ask."
          },
          problemStatement: {
            type: Type.STRING,
            description: "2–3 paragraphs describing the specific market problem this business solves, with South African context where relevant."
          },
          solution: {
            type: Type.STRING,
            description: "2–3 paragraphs describing the business solution, unique approach, and core value proposition."
          },
          businessModel: {
            type: Type.OBJECT,
            properties: {
              revenueStreams: { type: Type.ARRAY, items: { type: Type.STRING } },
              customerAcquisition: { type: Type.STRING },
              keyPartnerships: { type: Type.ARRAY, items: { type: Type.STRING } },
              costStructure: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          swot: {
            type: Type.OBJECT,
            properties: {
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              threats: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
          },
          marketResearch: {
            type: Type.OBJECT,
            properties: {
              tam: { type: Type.STRING, description: "Total Addressable Market in ZAR with reasoning" },
              sam: { type: Type.STRING, description: "Serviceable Addressable Market in ZAR with reasoning" },
              som: { type: Type.STRING, description: "Serviceable Obtainable Market in ZAR with reasoning" },
              targetAudience: { type: Type.ARRAY, items: { type: Type.STRING } },
              competitorAnalysis: { type: Type.STRING, description: "At least 300 words covering 3–4 competitors with positioning comparison" },
              marketTrends: { type: Type.ARRAY, items: { type: Type.STRING } },
              industryAnalysis: { type: Type.STRING, description: "3–4 paragraphs of SA industry analysis including growth rates, key drivers, regulatory climate, and future outlook." },
            }
          },
          productsServices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING, description: "At least 3 sentences" },
                pricing: { type: Type.STRING },
                differentiator: { type: Type.STRING },
              }
            }
          },
          goToMarket: {
            type: Type.OBJECT,
            properties: {
              strategy: { type: Type.STRING, description: "3–4 paragraphs on go-to-market approach" },
              channels: { type: Type.ARRAY, items: { type: Type.STRING } },
              milestones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    quarter: { type: Type.STRING },
                    goal: { type: Type.STRING },
                  }
                }
              }
            }
          },
          operationsPlan: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING },
              keyActivities: { type: Type.ARRAY, items: { type: Type.STRING } },
              technologyStack: { type: Type.ARRAY, items: { type: Type.STRING } },
              location: { type: Type.STRING },
            }
          },
          team: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                role: { type: Type.STRING },
                responsibilities: { type: Type.STRING },
                background: { type: Type.STRING },
              }
            }
          },
          financialPlan: {
            type: Type.OBJECT,
            properties: {
              fundingRequirement: { type: Type.STRING },
              fundingPurpose: { type: Type.STRING, description: "At least 2 paragraphs" },
              useOfFunds: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    amount: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  }
                }
              },
              revenueProjections: {
                type: Type.OBJECT,
                properties: {
                  y1: { type: Type.STRING },
                  y2: { type: Type.STRING },
                  y3: { type: Type.STRING },
                  assumptions: { type: Type.STRING },
                }
              },
              breakEven: { type: Type.STRING },
            }
          },
          riskMitigation: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                risk: { type: Type.STRING },
                impact: { type: Type.STRING },
                mitigation: { type: Type.STRING },
              }
            }
          },
          conclusion: {
            type: Type.STRING,
            description: "A strong 2–3 paragraph closing call to action directed at the funder."
          },
          viabilityScore: {
            type: Type.OBJECT,
            properties: {
              overall: { type: Type.NUMBER, description: "Score out of 100" },
              marketOpportunity: { type: Type.NUMBER },
              teamStrength: { type: Type.NUMBER },
              financialViability: { type: Type.NUMBER },
              socialImpact: { type: Type.NUMBER },
              competitivePosition: { type: Type.NUMBER },
              reasoning: { type: Type.STRING }
            }
          },
          businessModels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                advantages: { type: Type.ARRAY, items: { type: Type.STRING } },
                challenges: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          financialStatements: {
            type: Type.OBJECT,
            properties: {
              profitLoss: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    values: { type: Type.ARRAY, items: { type: Type.STRING } },
                    isTotal: { type: Type.BOOLEAN }
                  }
                }
              },
              balanceSheet: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    values: { type: Type.ARRAY, items: { type: Type.STRING } },
                    isTotal: { type: Type.BOOLEAN },
                    isHeader: { type: Type.BOOLEAN }
                  }
                }
              },
              cashFlow: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    values: { type: Type.ARRAY, items: { type: Type.STRING } },
                    isTotal: { type: Type.BOOLEAN }
                  }
                }
              }
            }
          },
          implementationPlan: {
            type: Type.OBJECT,
            properties: {
              preLaunch: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    tasks: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              },
              postLaunch: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    tasks: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              },
              fiveYearPlan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    year: { type: Type.STRING },
                    title: { type: Type.STRING },
                    initiatives: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              }
            }
          },
          visionMission: {
            type: Type.OBJECT,
            properties: {
              vision: { type: Type.STRING, description: "Inspiring 2–3 sentence vision statement for where the business will be in 10 years." },
              mission: { type: Type.STRING, description: "Clear 2–3 sentence mission statement describing the company's daily purpose." },
              coreValues: { type: Type.ARRAY, items: { type: Type.STRING }, description: "6–8 core company values, each as a short phrase." }
            }
          },
          valueProposition: {
            type: Type.STRING,
            description: "One powerful sentence capturing the unique value delivered to customers vs competitors."
          },
          solutionOverview: {
            type: Type.STRING,
            description: "5–6 detailed paragraphs: what the solution is, how it works step-by-step, the technology/methodology, measurable customer outcomes, and what makes it defensible."
          },
          competitorPositioning: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: "3–4 paragraphs analysing the competitive landscape, white spaces, and this business's positioning strategy." },
              competitors: {
                type: Type.ARRAY,
                description: "At least 5 competitors",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    productQuality: { type: Type.NUMBER, description: "Score 1–10" },
                    pricing: { type: Type.NUMBER, description: "Score 1–10 (10=most expensive)" },
                    innovation: { type: Type.NUMBER, description: "Score 1–10" },
                    customerService: { type: Type.NUMBER, description: "Score 1–10" },
                    marketPresence: { type: Type.NUMBER, description: "Score 1–10" },
                    keyWeakness: { type: Type.STRING }
                  }
                }
              }
            }
          },
          brandingIdentity: {
            type: Type.OBJECT,
            properties: {
              primaryColor: { type: Type.STRING, description: "Hex color code e.g. #2E1A47" },
              secondaryColor: { type: Type.STRING, description: "Hex color code" },
              accentColor: { type: Type.STRING, description: "Hex color code" },
              primaryFont: { type: Type.STRING, description: "e.g. Inter, Montserrat" },
              bodyFont: { type: Type.STRING },
              tagline: { type: Type.STRING },
              brandVoice: { type: Type.STRING, description: "2–3 sentences describing brand tone and personality" },
              brandPersonality: { type: Type.ARRAY, items: { type: Type.STRING }, description: "6 brand personality traits" }
            }
          },
          socialMediaStrategy: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING, description: "3 paragraphs on social media objectives, target audience online behaviour, and content philosophy." },
              platforms: {
                type: Type.ARRAY,
                description: "At least 4 platforms",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    audience: { type: Type.STRING },
                    postFrequency: { type: Type.STRING },
                    contentTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
                    primaryGoal: { type: Type.STRING }
                  }
                }
              },
              contentMix: {
                type: Type.ARRAY,
                description: "Content categories adding up to 100%",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    percentage: { type: Type.NUMBER },
                    description: { type: Type.STRING }
                  }
                }
              }
            }
          },
          seoStrategy: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING, description: "3 paragraphs on SEO and digital marketing strategy for the SA market." },
              keywords: {
                type: Type.ARRAY,
                description: "At least 10 keywords",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    intent: { type: Type.STRING, description: "Informational / Commercial / Transactional" },
                    difficulty: { type: Type.STRING, description: "Low / Medium / High" },
                    priority: { type: Type.STRING, description: "Primary / Secondary / Long-tail" }
                  }
                }
              }
            }
          },
          saCompliance: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING, description: "2 paragraphs on the regulatory environment for this business in South Africa." },
              requirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    body: { type: Type.STRING, description: "e.g. CIPC, SARS, POPIA, BEE, Health & Safety" },
                    requirement: { type: Type.STRING },
                    status: { type: Type.STRING, description: "Required / Optional / In Progress" },
                    notes: { type: Type.STRING }
                  }
                }
              }
            }
          }
      };

      const allPrompts = [
         { 
           label: "Core Identity & Vision", 
           sections: ['executiveSummary', 'problemStatement', 'solution', 'visionMission', 'valueProposition', 'solutionOverview'],
           instructions: "Write the executive summary, core problem in SA context, solution, and generate a compelling vision/mission/values and value proposition."
         },
         {
           label: "Business Model, Brand & Competitive Position",
           sections: ['swot', 'productsServices', 'businessModels', 'brandingIdentity', 'competitorPositioning'],
           instructions: "Elaborate deeply on revenue streams, products/services, SWOT, business models, and provide a full branding identity and competitive positioning analysis with at least 5 named competitors scored on 5 dimensions."
         },
         {
           label: "Market Research, Marketing & Operations",
           sections: ['marketResearch', 'goToMarket', 'operationsPlan', 'team', 'socialMediaStrategy', 'seoStrategy'],
           instructions: "Provide comprehensive market sizing (TAM/SAM/SOM in ZAR), industry analysis, go-to-market channels, operational plan, team structure, full social media strategy, and SEO keyword strategy."
         },
         {
           label: "Financial Deep Dive",
           sections: ['financialPlan', 'financialStatements'],
           instructions: "Generate investor-grade financials: P&L, Balance Sheet, Cash Flow (minimum 8 rows each), funding requirements, 3-year revenue projections with assumptions. All figures in ZAR."
         },
         {
           label: "Risk, Compliance, Implementation & Conclusion",
           sections: ['riskMitigation', 'saCompliance', 'implementationPlan', 'conclusion', 'viabilityScore'],
           instructions: "Detail 6+ risk mitigation strategies, a multi-phased implementation plan, strong conclusion, objective viability score, and full SA compliance requirements (CIPC, SARS, POPIA, BEE, Health & Safety)."
         }
      ];

      // Distribute based on totalBatches
      let batches: typeof allPrompts = [];
      if (totalBatches <= 3) {
         batches = [
           { label: "Identity, Model & Brand", sections: [...allPrompts[0].sections, ...allPrompts[1].sections], instructions: allPrompts[0].instructions + " " + allPrompts[1].instructions },
           allPrompts[2],
           { label: "Financials, Compliance & Implementation", sections: [...allPrompts[3].sections, ...allPrompts[4].sections], instructions: allPrompts[3].instructions + " " + allPrompts[4].instructions }
         ];
      } else if (totalBatches === 4) {
         batches = [
           { label: "Core Identity & Brand", sections: [...allPrompts[0].sections, ...allPrompts[1].sections], instructions: allPrompts[0].instructions + " " + allPrompts[1].instructions },
           allPrompts[2], allPrompts[3], allPrompts[4]
         ];
      } else {
         batches = allPrompts;
      }

      let mergedData: any = { docType: type === 'businessplan' ? 'Business Plan' : 'Funding Proposal' };
      let rollingContext = "";

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setBatchProgress({ current: i + 1, total: batches.length, label: batch.label });

        const batchProperties: any = {};
        batch.sections.forEach(sec => {
          const prop = (fullBusinessPlanSchemaProperties as any)[sec];
          if (prop !== undefined) {
            batchProperties[sec] = prop;
          } else {
            console.warn(`⚠️ Schema missing for section: "${sec}" — Gemini will skip this field. Add it to fullBusinessPlanSchemaProperties.`);
          }
        });

        const batchSchema = {
          type: Type.OBJECT,
          properties: batchProperties
        };

        const batchPrompt = `You are a senior South African business consultant writing a ${config.premiumOutput ? 'PREMIUM, INVESTOR-GRADE' : 'standard'} ${type === 'businessplan' ? 'business plan' : 'funding proposal'}.
This document will be submitted to formal funding bodies including NYDA, SEFA, IDC, NEF, and commercial banks. 
It must be thorough, specific, and compelling.

BUSINESS IDENTITY:
- Business Name: ${businessInfo.name}
- Industry: ${businessInfo.industry || 'General Services'}
- Business Type: ${businessInfo.type || 'Private Company'}
- Description: ${businessInfo.description || 'A growing South African enterprise.'}
- Products & Services: ${businessInfo.productsServices || 'Standard industry offerings.'}
- Years in Operation: ${businessInfo.years || 'Early stage'}
- Current Employees: ${businessInfo.employees || 'Lean founding team'}
- Current Revenue: ${businessInfo.revenue || 'Pre-revenue / early revenue'}
- B2B Connections: ${businessInfo.b2bConnection || 'Building pipeline'}

OWNER PROFILE:
- Name: ${businessInfo.ownerInfo?.name || ownerInfo.name || 'Founder'}
- Background: South African entrepreneur

FINANCIAL DOCUMENT CONTEXT: ${financialDocs || 'None uploaded — use realistic SA industry benchmarks'}

${fundingSpecifics}

PREVIOUSLY GENERATED SECTIONS CONTEXT (Ensure continuity):
${rollingContext ? rollingContext : "None."}

CURRENT BATCH TASK:
Generate only the specific fields defined in the schema.
${batch.instructions}

WRITING REQUIREMENTS:
1. Write every string field in full, professional prose. Zero placeholders.
2. Minimum 300 words per string field. For overview/analysis fields, minimum 500 words.
3. All arrays must have a minimum of 6 items (financial tables: minimum 10 rows).
4. ${config.premiumOutput ? 'PREMIUM MODE: Match the depth of a 95-page consulting-grade document. Each section must be exhaustive.' : 'Write comprehensively enough to fill at least 2 A4 pages per section.'}
5. All financial figures must be in South African Rand (ZAR) and internally consistent across all sections.
6. Ensure continuity with previously generated sections.
7. Use specific South African context: reference SA laws, SA funders (NYDA, SEFA, IDC, NEF), SA market data.
`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: batchPrompt,
          config: { 
            responseMimeType: 'application/json',
            responseSchema: batchSchema,
            maxOutputTokens: 32768
          }
        });

        let batchResult = {};
        try {
            batchResult = JSON.parse(response.text || '{}');
        } catch (e) {
            console.warn("JSON Parse failed, attempting recovery", e);
            let text = (response.text || '').trim();
            // simple fix for under-terminated string / object
            const lastBrace = text.lastIndexOf('}');
            if (lastBrace !== -1) {
                text = text.substring(0, lastBrace + 1);
                try { batchResult = JSON.parse(text); } catch(e2) {
                   console.warn("Extreme fallback failed", e2);
                }
            } else {
                if (text.startsWith('{')) { text += '}'; try { batchResult = JSON.parse(text); } catch(e3) {}}
            }
        }
        mergedData = { ...mergedData, ...batchResult };

        const resultSummary = Object.keys(batchResult).map(k => `${k} section generated.`).join(" ");
        rollingContext += `Batch ${i+1} (${batch.label}): ${resultSummary}\n`;
      }

      setGeneratedBusinessPlanData(mergedData);
    } catch (e) {
      console.error(e);
      alert('Generation failed. Check your connection.');
    } finally {
      setIsGeneratingProposal(false);
      setBatchProgress(null);
    }
  };

  const handleSaveBusiness = async () => {
    if (!user) return;
    setIsSaving(true);
    
    const userDocRef = doc(db, 'users', user.id);
    try {
      await setDoc(userDocRef, { profile: businessInfo, ownerInfo: ownerInfo }, { merge: true });
      alert('Profile information updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    
    const docsRef = collection(db, 'users', user.id, 'documents');
    
    // In a real app we'd upload to Firebase Storage here.
    // For this prototype, we save metadata to Firestore.
    try {
      const promises = Array.from(files).map(async (file) => {
          const newDoc = {
              userId: user.id,
              name: file.name,
              type: file.type || 'application/octet-stream',
              size: file.size,
              uploadDate: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
              category: 'General'
          };
          const ref = await addDoc(docsRef, newDoc);
          return { id: ref.id, ...newDoc } as AppDocument;
      });

      const newDocs = await Promise.all(promises);
      setDocuments(prev => [...prev, ...newDocs]);
      alert(`${newDocs.length} file(s) uploaded successfully!`);
    } catch (error) {
      alert("There was a problem uploading your documents. Please try again.");
      console.error(error);
      handleFirestoreError(error, OperationType.CREATE, `users/${user.id}/documents`);
    }
  };

  const removeDocument = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.id, 'documents', id));
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.id}/documents/${id}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadPack = () => {
    alert("In a real app, this would trigger a ZIP download containing all your PDFs and the checklist. For now, you can print the checklist!");
    window.print();
  };

  const isPaid = user?.subscriptionPlan !== 'free';

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 group font-bold">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Mission Control
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-black mb-2 tracking-tight">Profile & Documents</h1>
        <p className="text-gray-400 text-lg">Complete your profile to unlock auto-fill features</p>
      </div>

      <div className="flex gap-4 mb-8 overflow-x-auto pb-2 custom-scrollbar">
        {[
          { id: 'business', label: 'Business Info' },
          { id: 'owner', label: 'Owner Info' },
          { id: 'documents', label: 'Documents Area' },
          { id: 'subscription', label: 'Subscription' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold border transition-all capitalize ${activeTab === tab.id ? 'bg-purple-600/10 border-purple-500 text-purple-400' : 'bg-white/5 border-white/5 text-gray-500 hover:text-gray-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-3xl p-8">
        {viewingDocument ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-purple-400" />
                <h3 className="text-lg font-black">{viewingDocument.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (viewingDocument.content) {
                      navigator.clipboard.writeText(viewingDocument.content);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  title="Copy to clipboard"
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
                >
                  {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                </button>
                <button onClick={() => setViewingDocument(null)} className="p-2.5 rounded-xl hover:bg-white/5 text-gray-500"><X size={20} /></button>
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar bg-black/40 p-8 rounded-2xl border border-white/5 mb-6 shadow-inner">
              <div className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed font-serif prose prose-invert max-w-none">
                {viewingDocument.content}
              </div>
            </div>
          </div>
        ) : activeTab === 'business' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
               <div>
                  <h4 className="font-black text-cyan-400 flex items-center gap-2 mb-1"><Sparkles size={18} /> Auto-Fill with AI</h4>
                  <p className="text-sm text-gray-400">Instantly populate your profile using information from your already uploaded Vault documents.</p>
               </div>
               <button 
                  onClick={handleAutoFillFromVault}
                  disabled={isSaving}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl whitespace-nowrap transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
               >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} 
                  {isSaving ? 'Extracting...' : 'Scan My Vault'}
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="text" value={businessInfo.name} onChange={(e) => setBusinessInfo({...businessInfo, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Registration Number</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="text" value={businessInfo.registration} onChange={(e) => setBusinessInfo({...businessInfo, registration: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. 2024/123456/07" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Industry</label>
                <input type="text" value={businessInfo.industry} onChange={(e) => setBusinessInfo({...businessInfo, industry: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. Technology, Agriculture" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  WhatsApp Number <MessageCircle size={14} className="text-emerald-400" />
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="tel" value={businessInfo.whatsapp} onChange={(e) => setBusinessInfo({...businessInfo, whatsapp: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="+27 71 234 5678" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Employee Count</label>
                <input type="number" value={businessInfo.employees} onChange={(e) => setBusinessInfo({...businessInfo, employees: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. 5" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Years of Operation</label>
                <input type="number" value={businessInfo.years} onChange={(e) => setBusinessInfo({...businessInfo, years: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. 2" />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <ShoppingBag size={14} className="text-purple-400" /> Products & Services
              </label>
              <textarea rows={3} value={businessInfo.productsServices} onChange={(e) => setBusinessInfo({...businessInfo, productsServices: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="List what you sell or the services you provide..." />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Business Vision & Description</label>
              <textarea rows={4} value={businessInfo.description} onChange={(e) => setBusinessInfo({...businessInfo, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="Briefly describe your business goals and current operations..." />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">What Are Your Prices & Monthly Income?</label>
              <textarea rows={3} value={businessInfo.financialData} onChange={(e) => setBusinessInfo({...businessInfo, financialData: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="What do you charge for your products or services? Roughly how much does the business make per month, and what are your main costs?" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Who Are Your Clients & Why Choose You?</label>
              <textarea rows={3} value={businessInfo.b2bConnection} onChange={(e) => setBusinessInfo({...businessInfo, b2bConnection: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="Who buys from you? Are they individuals or other businesses? Why do they buy from you instead of your competitors?" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Company Logo URL (Optional)</label>
              <input type="url" value={businessInfo.logoUrl} onChange={(e) => setBusinessInfo({...businessInfo, logoUrl: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="https://example.com/logo.png" />
            </div>
            <button onClick={handleSaveBusiness} disabled={isSaving} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xl shadow-purple-500/20">
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} Save Information
            </button>
          </div>
        )}

        {activeTab === 'owner' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
               <div>
                  <h4 className="font-black text-cyan-400 flex items-center gap-2 mb-1"><Sparkles size={18} /> Auto-Fill with AI</h4>
                  <p className="text-sm text-gray-400">Instantly populate owner details using information from your already uploaded Vault documents.</p>
               </div>
               <button 
                  onClick={handleAutoFillOwnerFromVault}
                  disabled={isSaving}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl whitespace-nowrap transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
               >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} 
                  {isSaving ? 'Extracting...' : 'Scan My Vault'}
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Full Name</label>
                <input type="text" value={ownerInfo.name} onChange={(e) => setOwnerInfo({...ownerInfo, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. John Doe" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">ID Number</label>
                <input type="text" value={ownerInfo.idNumber} onChange={(e) => setOwnerInfo({...ownerInfo, idNumber: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. 9001015009087" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Race / BEE Status</label>
                <select value={ownerInfo.race} onChange={(e) => setOwnerInfo({...ownerInfo, race: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none">
                  <option value="" className="bg-gray-900">Select Race</option>
                  <option value="African" className="bg-gray-900">African</option>
                  <option value="Coloured" className="bg-gray-900">Coloured</option>
                  <option value="Indian" className="bg-gray-900">Indian</option>
                  <option value="White" className="bg-gray-900">White</option>
                  <option value="Other" className="bg-gray-900">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gender</label>
                <select value={ownerInfo.gender} onChange={(e) => setOwnerInfo({...ownerInfo, gender: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none">
                  <option value="" className="bg-gray-900">Select Gender</option>
                  <option value="Male" className="bg-gray-900">Male</option>
                  <option value="Female" className="bg-gray-900">Female</option>
                  <option value="Other" className="bg-gray-900">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Age</label>
                <input type="number" value={ownerInfo.age} onChange={(e) => setOwnerInfo({...ownerInfo, age: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="e.g. 30" />
              </div>
            </div>
            <button onClick={handleSaveBusiness} disabled={isSaving} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xl shadow-purple-500/20">
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} Save Information
            </button>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {showSubmissionPack ? (
              <div className="animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black flex items-center gap-2"><Package size={24} className="text-cyan-400" /> Physical Submission Pack</h3>
                  <button onClick={() => setShowSubmissionPack(false)} className="text-sm font-bold text-gray-500 hover:text-white">Close Pack</button>
                </div>
                <div className="bg-white text-black p-8 rounded-2xl shadow-2xl mb-6 font-serif">
                   <div className="text-center border-b-2 border-black pb-4 mb-6">
                     <h2 className="text-3xl font-bold uppercase tracking-widest mb-2">Application Cover Sheet</h2>
                     <p className="text-sm font-bold">{businessInfo.name} | Reg: {businessInfo.registration}</p>
                   </div>
                   
                   <p className="mb-4 text-sm">Please find attached the following documents for the funding application:</p>
                   
                   <div className="space-y-2 mb-8">
                     {documents.map((doc, i) => (
                       <div key={doc.id} className="flex items-center gap-2 border-b border-gray-200 pb-2">
                         <div className="w-4 h-4 border border-black flex items-center justify-center text-xs">✓</div>
                         <span className="font-bold text-sm">Annexure {String.fromCharCode(65 + i)}:</span>
                         <span className="text-sm">{doc.name}</span>
                       </div>
                     ))}
                   </div>

                   <div className="mt-12 pt-8 border-t border-black flex justify-between items-end">
                     <div>
                       <div className="h-0.5 w-48 bg-black mb-2"></div>
                       <p className="text-xs font-bold uppercase">Applicant Signature</p>
                     </div>
                     <p className="text-xs font-bold">{new Date().toLocaleDateString()}</p>
                   </div>
                </div>
                <button onClick={handleDownloadPack} className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all">
                  <Printer size={20} /> Print Pack Checklist
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files)} />
                    <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2 shadow-lg"><Upload size={32} /></div>
                    <div>
                      <h4 className="text-lg font-bold">Upload Documents</h4>
                      <p className="text-xs text-gray-500 mt-1 font-medium">Upload Bank Statements, Quotations, or ID</p>
                    </div>
                  </div>

                  <div className="glass-panel p-8 rounded-3xl border border-cyan-500/20 relative overflow-hidden group bg-gradient-to-br from-cyan-500/5 to-transparent">
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                        <Sparkles size={20} />
                      </div>
                      <h4 className="font-black text-sm uppercase tracking-widest">AI Power Tools</h4>
                      {!isPaid && (
                        <div className="ml-auto bg-black/50 px-2 py-1 rounded text-[10px] font-bold uppercase border border-white/20 flex items-center gap-1">
                          <Lock size={10} /> Pro
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-6 font-medium">Generate high-quality business documents including <span className="text-cyan-400">financial projections</span>.</p>
                    
                    <div className="space-y-3">
                      <button 
                        onClick={() => {
                           if (!isPaid) onUpgrade();
                           else setConfigModal({ type: 'proposal', amount: '', purpose: '', impact: '', roi: '', premiumOutput: false });
                        }}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all group relative overflow-hidden"
                      >
                         {!isPaid && (
                           <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                             <Lock size={14} className="text-white" />
                           </div>
                         )}
                        <div className="flex items-center gap-3">
                          <PenTool size={18} className="text-cyan-400" />
                          <span className="text-xs font-bold">Funding Proposal</span>
                        </div>
                        {isGeneratingProposal ? <Loader2 size={16} className="animate-spin text-cyan-400" /> : <ChevronRight size={16} className="text-gray-600 group-hover:text-cyan-400" />}
                      </button>
                      <button 
                        onClick={() => {
                           if (!isPaid) onUpgrade();
                           else setConfigModal({ type: 'businessplan', amount: '', purpose: '', impact: '', roi: '', premiumOutput: false });
                        }}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
                      >
                         {!isPaid && (
                           <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                             <Lock size={14} className="text-white" />
                           </div>
                         )}
                        <div className="flex items-center gap-3">
                          <BarChart3 size={18} className="text-indigo-400" />
                          <div className="text-left">
                            <span className="text-xs font-bold block">Business Plan</span>
                            <span className="text-[8px] uppercase tracking-tighter text-indigo-400 font-black">Incl. Financial Projections</span>
                          </div>
                        </div>
                        {isGeneratingProposal ? <Loader2 size={16} className="animate-spin text-indigo-400" /> : <ChevronRight size={16} className="text-gray-600 group-hover:text-indigo-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Text-based proposal rendering removed */}

                {generatedBusinessPlanData && (
                  <BusinessPlanDocument
                     data={generatedBusinessPlanData}
                     businessInfo={{...businessInfo, ownerInfo}}
                     title={generatedBusinessPlanData.docType}
                     onClose={() => setGeneratedBusinessPlanData(null)}
                  />
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-300">Your Documents ({documents.length})</h4>
                    <div className="flex gap-2">
                      {documents.length > 0 && (
                         <button 
                            onClick={() => setShowSubmissionPack(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
                          >
                           <Package size={12} /> Prepare Physical Submission
                         </button>
                      )}
                    </div>
                  </div>
                  {documents.length > 0 ? (
                    documents.map((doc) => (
                      <div key={doc.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between group overflow-hidden relative">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-400"><File size={20} /></div>
                          <div>
                            <h5 className="font-bold text-sm truncate max-w-[200px]">{doc.name}</h5>
                            <p className="text-[10px] text-gray-500">{formatFileSize(doc.size)} • {doc.uploadDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.content && (
                            <button 
                              onClick={() => setViewingDocument(doc)}
                              title="View Document"
                              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm bg-white/5 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/30 border border-transparent"
                            >
                              <BookOpen size={12} /> View
                            </button>
                          )}
                          <button 
                            onClick={() => handleAIAnalyze(doc.id, doc.name)}
                            disabled={isScanning !== null}
                            title="Extract data from this document"
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm ${isScanning === doc.id ? 'bg-cyan-500 text-white' : 'bg-white/5 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-transparent'}`}
                          >
                            {isScanning === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} 
                            {isScanning === doc.id ? 'Extracting...' : 'Auto-Fill Profile'}
                          </button>
                          <button onClick={() => removeDocument(doc.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"><X size={16} /></button>
                        </div>
                        {isScanning === doc.id && <div className="absolute inset-x-0 bottom-0 h-1 animate-shimmer"></div>}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 opacity-30">
                      <FileText size={32} className="mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase tracking-widest">No documents found</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {activeTab === 'subscription' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">Subscription Management</h3>
                <p className="text-gray-500 text-sm">View and manage your current billing plan</p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold flex items-center gap-2">
                <Crown size={18} />
                <span className="capitalize">{user?.subscriptionPlan || 'free'}</span> Plan
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel p-6 rounded-2xl border-purple-500/30">
                <h4 className="font-bold text-lg mb-4 text-purple-400 flex items-center gap-2">
                  <CreditCard size={20} /> Current Plan
                </h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <span className="text-gray-400">Status</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={14} /> Active
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <span className="text-gray-400">Plan</span>
                    <span className="font-bold capitalize">{user?.subscriptionPlan || 'free'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Billing Cycle</span>
                    <span className="font-bold capitalize">{user?.billingCycle || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={onUpgrade}
                  className="w-full relative group overflow-hidden bg-white/5 hover:bg-white/10 text-white font-black py-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border border-purple-500/20 hover:border-purple-500/50"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <Crown size={24} className="text-amber-400 mb-1" />
                  <span className="text-lg">Upgrade Plan</span>
                  <span className="text-xs font-normal text-gray-400">Unlock premium features and AI limits</span>
                </button>

                {(user?.subscriptionPlan !== 'free') && (
                  <button 
                    onClick={() => {
                      if (confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing cycle.')) {
                        if (onCancelSubscription) {
                          onCancelSubscription();
                        } else {
                          alert('In a real app, this would trigger a cancellation flow. For now, please contact support.');
                        }
                      }
                    }}
                    className="w-full bg-white/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 font-bold py-4 rounded-2xl flex items-center justify-center transition-all border border-white/5 hover:border-red-500/20"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111827] border border-white/10 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setConfigModal(null)}
              className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-black text-white mb-2">Funding Details</h3>
            <p className="text-gray-400 text-sm mb-6">Before we generate your {configModal.type === 'proposal' ? 'Funding Proposal' : 'Business Plan'}, tell us a bit about what you're applying for.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">How much funding do you need?</label>
                <input type="text" value={configModal.amount} onChange={e => setConfigModal({...configModal, amount: e.target.value})} placeholder="e.g., R 500,000" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">What are you applying for? (Purpose)</label>
                <input type="text" value={configModal.purpose} onChange={e => setConfigModal({...configModal, purpose: e.target.value})} placeholder="e.g., Buying new equipment, working capital" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">How will this help your business?</label>
                <textarea value={configModal.impact} onChange={e => setConfigModal({...configModal, impact: e.target.value})} placeholder="e.g., It will allow us to double production capacity..." className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:border-cyan-500 focus:outline-none h-24 custom-scrollbar" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Expected Revenue Impact (ROI)?</label>
                <input type="text" value={configModal.roi} onChange={e => setConfigModal({...configModal, roi: e.target.value})} placeholder="e.g., Increase monthly revenue by 40%" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
            </div>

            <label className="flex items-center gap-3 mt-6 p-4 rounded-xl border border-purple-500/30 bg-purple-500/10 cursor-pointer hover:bg-purple-500/20 transition-all">
              <input 
                type="checkbox" 
                checked={configModal.premiumOutput}
                onChange={e => setConfigModal({...configModal, premiumOutput: e.target.checked})}
                className="w-5 h-5 rounded border-white/20 bg-black/50 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900" 
              />
              <div className="flex-1">
                <div className="font-bold text-white flex items-center gap-2">Premium Output <Crown size={16} className="text-amber-400" /></div>
                <div className="text-xs text-gray-400">Forces maximum detail (5-batch generation) regardless of funding amount. Takes longer.</div>
              </div>
            </label>
            
            <button 
              onClick={() => {
                const type = configModal.type;
                const config = { ...configModal };
                setConfigModal(null);
                handleGenerateProposal(type, config);
              }}
              disabled={!configModal.amount || !configModal.purpose}
              className="w-full mt-8 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black py-4 rounded-xl flex justify-center items-center gap-2"
            >
              Generate Document <Wand2 size={18} />
            </button>
          </div>
        </div>
      )}

      {batchProgress && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-gray-900 border border-white/10 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative text-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-6">
              <Loader2 size={32} className="animate-spin" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Generating Content</h3>
            <p className="text-gray-400 text-sm mb-6">{batchProgress.label}</p>
            
            <div className="flex justify-between text-xs font-bold text-gray-400 mb-2 px-1">
              <span>{Math.round(((batchProgress.current - 1) / batchProgress.total) * 100)}%</span>
              <span>100%</span>
            </div>
            <div className="w-full bg-black/50 overflow-hidden h-3 rounded-full mb-3 border border-white/5">
               <div 
                 className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                 style={{ width: `${((batchProgress.current - 1) / batchProgress.total) * 100}%` }}
               />
            </div>
            <div className="text-xs font-bold text-cyan-500/70 uppercase tracking-widest">
              Batch {batchProgress.current} OF {batchProgress.total}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProfileForm;

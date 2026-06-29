import React, { useState, useEffect, useRef } from 'react';
import { Camera, Laptop, HelpCircle, Upload, X, Loader2, PenTool, BarChart3, CheckCircle2, ChevronRight, Plus, Trash2, Printer, Search, Link as LinkIcon, FileText, Check } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { handleGeminiError } from '../services/geminiError';
import { User, AppDocument } from '../types';
import BusinessPlanDocument from './BusinessPlanDocument';
import PitchDeckDocument from './PitchDeckDocument';

interface FundingNeedsTrackerProps {
  user: User | null;
  onUpgrade: () => void;
  businessInfo: any;
  ownerInfo: any;
}

export interface FundingNeed {
  id: string;
  itemName: string;
  estimatedCost: number;
  reason: string;
  status: 'pending' | 'applied' | 'received';
  appliedTo?: string;
  productLink?: string;
  quotationDocId?: string;
  quotationDocName?: string;
}

const FundingNeedsTracker: React.FC<FundingNeedsTrackerProps> = ({ user, onUpgrade, businessInfo, ownerInfo }) => {
  const [needs, setNeeds] = useState<FundingNeed[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newItem, setNewItem] = useState({ itemName: '', estimatedCost: '', reason: '', appliedTo: '' });
  
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [generatedBusinessPlanData, setGeneratedBusinessPlanData] = useState<any | null>(null);
  const [generatedPitchDeckData, setGeneratedPitchDeckData] = useState<any | null>(null);

  const [editingLinkFor, setEditingLinkFor] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQuotationFor, setUploadingQuotationFor] = useState<string | null>(null);

  useEffect(() => {
    const fetchNeeds = async () => {
      if (!user) return;
      try {
        const needsRef = collection(db, 'users', user.id, 'funding_needs');
        const snap = await getDocs(needsRef);
        const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingNeed));
        setNeeds(fetched);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNeeds();
  }, [user]);

  const handleAddNeed = async () => {
    if (!user) return;
    if (!newItem.itemName || !newItem.estimatedCost) return;
    
    try {
      const needsRef = collection(db, 'users', user.id, 'funding_needs');
      const docData: Omit<FundingNeed, 'id'> = {
        itemName: newItem.itemName,
        estimatedCost: Number(newItem.estimatedCost),
        reason: newItem.reason,
        status: 'pending',
        appliedTo: newItem.appliedTo
      };
      const docRef = await addDoc(needsRef, docData);
      setNeeds([...needs, { id: docRef.id, ...docData }]);
      setNewItem({ itemName: '', estimatedCost: '', reason: '', appliedTo: '' });
      setIsAdding(false);
    } catch (e) {
      console.error(e);
      alert('Failed to add need');
    }
  };

  const handleRemoveNeed = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.id, 'funding_needs', id));
      setNeeds(needs.filter(n => n.id !== id));
    } catch (e) {
      console.error(e);
    }
  };
  
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    if (!user) return;
    const nextStatus = currentStatus === 'pending' ? 'applied' : currentStatus === 'applied' ? 'received' : 'pending';
    try {
      await updateDoc(doc(db, 'users', user.id, 'funding_needs', id), { status: nextStatus });
      setNeeds(needs.map(n => n.id === id ? { ...n, status: nextStatus as any } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveLink = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.id, 'funding_needs', id), { productLink: tempLink });
      setNeeds(needs.map(n => n.id === id ? { ...n, productLink: tempLink } : n));
      setEditingLinkFor(null);
    } catch (e) {
      console.error("Failed to save link", e);
    }
  };

  const handleUploadQuotation = async (e: React.ChangeEvent<HTMLInputElement>, needId: string) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    const file = files[0];
    
    setUploadingQuotationFor(needId);
    
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        
        const docsRef = collection(db, 'users', user.id, 'documents');
        const newDoc = {
            userId: user.id,
            name: `Quotation: ${file.name}`,
            type: file.type || 'application/pdf',
            size: file.size,
            uploadDate: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            category: 'Quotation'
        };
        
        const docRef = await addDoc(docsRef, newDoc);
        
        // Use Gemini to extract item name and price
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
        const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: [
                {
                   role: 'user',
                   parts: [
                       { inlineData: { data: base64Data, mimeType: file.type || 'application/pdf' } },
                       { text: "Extract the primary quoted item's name and the total cost (price) from this quotation. Return ONLY JSON like {\"itemName\": \"Real Product Name\", \"estimatedCost\": 25000}. If you can't find it, return empty object." }
                   ]
                }
             ],
             config: {
                 responseMimeType: 'application/json',
                 responseSchema: {
                     type: Type.OBJECT,
                     properties: {
                         itemName: { type: Type.STRING },
                         estimatedCost: { type: Type.NUMBER }
                     }
                 }
             }
        });
        
        const extracted = JSON.parse(response.text || '{}');
        const updateData: any = { 
          quotationDocId: docRef.id,
          quotationDocName: newDoc.name
        };
        
        if (extracted.itemName && extracted.estimatedCost) {
            updateData.itemName = extracted.itemName;
            updateData.estimatedCost = extracted.estimatedCost;
            alert(`AI successfully extracted Item: ${extracted.itemName}, Cost: R${extracted.estimatedCost}`);
        } else {
            alert('Quotation uploaded, but AI could not extract the item name and cost.');
        }

        await updateDoc(doc(db, 'users', user.id, 'funding_needs', needId), updateData);
        
        setNeeds(needs.map(n => n.id === needId ? { ...n, ...updateData } : n));
      } catch (error) {
        
        handleGeminiError(error);
        alert("Failed to upload quotation");
      } finally {
        setUploadingQuotationFor(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
        alert("Failed to read file.");
        setUploadingQuotationFor(null);
    };
    reader.readAsDataURL(file);
  };

  const pitchDeckSchema = {
    type: Type.OBJECT,
    properties: {
      tagline: { type: Type.STRING, description: "Max 12 words. Cover slide hook." },
      hook: { type: Type.STRING, description: "One sentence funding ask, e.g. 'Raising R500,000 to scale production.'" },
      problem: { type: Type.STRING, description: "Max 60 words. Punchy, no fluff." },
      solution: { type: Type.STRING, description: "Max 60 words. Punchy, no fluff." },
      viabilityScore: {
        type: Type.OBJECT,
        properties: {
          overall: { type: Type.NUMBER },
          marketOpportunity: { type: Type.NUMBER },
          teamStrength: { type: Type.NUMBER },
          financialViability: { type: Type.NUMBER },
          socialImpact: { type: Type.NUMBER },
          competitivePosition: { type: Type.NUMBER },
          reasoning: { type: Type.STRING, description: "Max 30 words." }
        }
      },
      marketSize: {
        type: Type.OBJECT,
        properties: {
          tam: { type: Type.STRING, description: "Max 15 words, lead with ZAR figure." },
          sam: { type: Type.STRING, description: "Max 15 words, lead with ZAR figure." },
          som: { type: Type.STRING, description: "Max 15 words, lead with ZAR figure." }
        }
      },
      topProducts: {
        type: Type.ARRAY,
        description: "Exactly the top 3 products/services.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING, description: "Max 25 words." },
            price: { type: Type.STRING, description: "Short value only, e.g. 'R450/month'." }
          }
        }
      },
      businessModel: {
        type: Type.OBJECT,
        properties: {
          primaryRevenueStream: { type: Type.STRING, description: "Max 25 words." },
          secondaryRevenueStream: { type: Type.STRING, description: "Max 25 words. Leave blank if single-stream." }
        }
      },
      competitors: {
        type: Type.ARRAY,
        description: "Top 4-5 competitors only.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            productQuality: { type: Type.NUMBER, description: "1-10" },
            pricing: { type: Type.NUMBER, description: "1-10, 10=most expensive" },
            innovation: { type: Type.NUMBER, description: "1-10" },
            keyWeakness: { type: Type.STRING, description: "Max 12 words." }
          }
        }
      },
      goToMarket: {
        type: Type.OBJECT,
        properties: {
          channels: { type: Type.ARRAY, items: { type: Type.STRING, description: "Max 10 words each." }, description: "Top 3-4 channels only." },
          headlineMilestone: { type: Type.STRING, description: "Max 20 words." }
        }
      },
      team: {
        type: Type.ARRAY,
        description: "Top 2-3 key people only.",
        items: {
          type: Type.OBJECT,
          properties: {
            role: { type: Type.STRING },
            oneLiner: { type: Type.STRING, description: "Max 15 words." }
          }
        }
      },
      theAsk: {
        type: Type.OBJECT,
        properties: {
          fundingAmount: { type: Type.STRING, description: "Short value only, e.g. 'R500,000'." },
          useOfFunds: {
            type: Type.ARRAY,
            description: "Top 4 categories only.",
            items: {
              type: Type.OBJECT,
              properties: { category: { type: Type.STRING }, amount: { type: Type.STRING } }
            }
          },
          revenueSnapshot: {
            type: Type.OBJECT,
            properties: { y1: { type: Type.STRING }, y2: { type: Type.STRING }, y3: { type: Type.STRING } }
          }
        }
      },
      closingStatement: { type: Type.STRING, description: "Max 40 words. Confident closing CTA." }
    }
  };

  const handleGeneratePitchDeck = async (need: FundingNeed) => {
    if (user?.subscriptionPlan === 'free') { onUpgrade(); return; }
    if (!user || (!businessInfo?.name && !user.businessName)) { alert('Please fill in your business name in your profile before generating a document.'); return; }

    setIsGeneratingProposal(true);
    setGeneratedPitchDeckData(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });

      const prompt = `You are a senior South African pitch consultant writing content for a 12-slide investor pitch deck for a live presentation.

BUSINESS IDENTITY:
- Business Name: ${businessInfo?.name || user.businessName}
- Industry: ${businessInfo?.industry || 'General Services'}
- Description: ${businessInfo?.description || 'A growing South African enterprise.'}
- Products & Services: ${businessInfo?.productsServices || 'Standard industry offerings.'}

FUNDING SPECIFICS (CRITICAL - THIS PROPOSAL IS SPECIFICALLY FOR THIS NEED):
- Item Needed: ${need.itemName}
- Amount Requested: R${need.estimatedCost.toLocaleString()}
- Purpose of Funding: ${need.reason || 'To acquire ' + need.itemName + ' for business operations.'}
- Business Impact: Essential equipment for growth and operational efficiency
- Expected Revenue Impact/ROI: Immediate improvement in service delivery

WRITING REQUIREMENTS:
1. Every field has a strict word/sentence limit in its schema description — respect it exactly. This is a slide deck, not a document. Be punchy, confident, concise.
2. All financial figures in ZAR.
3. Brief SA context where relevant (NYDA, SEFA, IDC, NEF) — one mention max, not throughout.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: pitchDeckSchema, maxOutputTokens: 8192 }
      });

      const deckData = JSON.parse(response.text || '{}');
      // No productImages in FundingNeedsTracker currently, so pass empty array
      setGeneratedPitchDeckData({ ...deckData, productImages: [], docType: "Pitch Deck: " + need.itemName });
    } catch (e) {
      handleGeminiError(e);
      alert('Pitch deck generation failed.');
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const handleGenerateProposal = async (type: 'proposal' | 'businessplan', need: FundingNeed) => {
    if (user?.subscriptionPlan === 'free') {
      onUpgrade();
      return;
    }

    if (!user || (!businessInfo?.name && !user.businessName)) {
      alert('Please fill in your business name in your profile before generating a document.');
      return;
    }
    
    setIsGeneratingProposal(true);
    setGeneratedBusinessPlanData(null);
    
    const financialDocs = 'Quotations for ' + need.itemName;

    const fundingSpecifics = `
         FUNDING SPECIFICS (CRITICAL - THIS PROPOSAL IS SPECIFICALLY FOR THIS NEED):
         - Item Needed: ${need.itemName}
         - Amount Requested: R${need.estimatedCost.toLocaleString()}
         - Purpose of Funding: ${need.reason || `To acquire ${need.itemName} for business operations.`}
         - Business Impact: Essential equipment for growth and operational efficiency
         - Expected Revenue Impact/ROI: Immediate improvement in service delivery
    `;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      
      const totalBatches = 5;

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
           allPrompts[3], // Financial Deep Dive — own call now
           allPrompts[4]  // Risk, Compliance, Implementation, Conclusion — own call now
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
        
        // Removed setBatchProgress since it is not defined in FundingNeedsTracker

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

        const batchPrompt = `You are a senior South African business consultant writing a ${'PREMIUM, INVESTOR-GRADE'} ${type === 'businessplan' ? 'business plan' : 'funding proposal'}.
This document will be submitted to formal funding bodies including NYDA, SEFA, IDC, NEF, and commercial banks. 
It must be thorough, specific, and compelling.

BUSINESS IDENTITY:
- Business Name: ${businessInfo?.name || user.businessName}
- Industry: ${businessInfo?.industry || 'General Services'}
- Business Type: Private Company
- Description: ${businessInfo?.description || 'A growing South African enterprise.'}
- Products & Services: Standard industry offerings.
- Years in Operation: Early stage
- Current Employees: Lean founding team
- Current Revenue: Pre-revenue / early revenue
- B2B Connections: Building pipeline
FINANCIAL DOCUMENT CONTEXT: ${financialDocs || 'None uploaded — use realistic SA industry benchmarks'}

${fundingSpecifics}

PREVIOUSLY GENERATED SECTIONS CONTEXT (Ensure continuity):
${rollingContext ? rollingContext : "None."}

CURRENT BATCH TASK:
Generate only the specific fields defined in the schema.
${batch.instructions}

WRITING REQUIREMENTS:
1. Write substantive narrative fields (executive summary, overviews, summaries, conclusion, descriptions) in full, professional prose. Zero placeholders.
2. Narrative/overview fields: minimum 300 words. Deep analysis fields: minimum 500 words.
3. SHORT structured fields — individual array items like "tasks", "initiatives", "risk", "impact", "mitigation", "notes" — must be 1–3 concise sentences each, NOT essays. Depth belongs in narrative fields, not repeated in every array item.
4. All arrays must have a minimum of 6 items (financial tables: minimum 10 rows).
5. ${'PREMIUM MODE: Match the depth of a 95-page consulting-grade document. Each narrative section must be exhaustive — but structured array items still stay concise per rule 3.'}
6. All financial figures must be in South African Rand (ZAR) and internally consistent across all sections.
7. Ensure continuity with previously generated sections.
8. Use specific South African context: reference SA laws, SA funders (NYDA, SEFA, IDC, NEF), SA market data.
`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: batchPrompt,
          config: { 
            responseMimeType: 'application/json',
            responseSchema: batchSchema,
            maxOutputTokens: 65536
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
                   // extreme fallback: extract any keys we can by wrapping them ? too complex, just use empty
                   console.warn("Extreme fallback failed", e2);
                }
            } else {
                // Not even one brace?
                if (text.startsWith('{')) { text += '}'; try { batchResult = JSON.parse(text); } catch(e3) {}}
            }
        }
        
        console.log(`Batch ${i+1} (${batch.label}) — keys received:`, Object.keys(batchResult));
        console.log(`Batch ${i+1} raw response length:`, (response.text || '').length, 'chars');

        mergedData = { ...mergedData, ...batchResult };

        const resultSummary = Object.keys(batchResult).map(k => `${k} section generated.`).join(" ");
        rollingContext += `Batch ${i+1} (${batch.label}): ${resultSummary}\n`;
      }

      setGeneratedBusinessPlanData({ ...mergedData, docType: type === 'businessplan' ? `Business Plan: ${need.itemName}` : `Funding Proposal: ${need.itemName}` });
    } catch (e) {
      
      handleGeminiError(e);
      alert('Generation failed. Check your connection.');
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const isPaid = user?.subscriptionPlan !== 'free';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h3 className="text-2xl font-black flex items-center gap-2">Funding Needs Tracker</h3>
           <p className="text-gray-400 text-sm">List specific assets you need funding for and generate custom proposals.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />} {isAdding ? 'Cancel' : 'Add New Need'}
        </button>
      </div>

      {isAdding && (
        <div className="glass-panel p-6 rounded-3xl border border-indigo-500/30 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Item Name</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g. High-end Laptop, Outdoor Jungle Gym"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={newItem.itemName}
                  onChange={e => setNewItem({...newItem, itemName: e.target.value})}
                />
             </div>
             <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Estimated Cost (ZAR)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 50000"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={newItem.estimatedCost}
                  onChange={e => setNewItem({...newItem, estimatedCost: e.target.value})}
                />
             </div>
             <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Applying To (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. NYDA, NEF, SEDFA"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={newItem.appliedTo}
                  onChange={e => setNewItem({...newItem, appliedTo: e.target.value})}
                />
             </div>
          </div>
          <div className="space-y-1 mb-6">
             <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Reason / Why you need it</label>
             <textarea 
               placeholder="Briefly explain why this is needed (e.g. 'To run local AI models and automate admin work')"
               className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-20"
               value={newItem.reason}
               onChange={e => setNewItem({...newItem, reason: e.target.value})}
             />
          </div>
          <button 
             onClick={handleAddNeed}
             disabled={!newItem.itemName || !newItem.estimatedCost}
             className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
             Save Funding Need
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>
      ) : needs.length === 0 && !isAdding ? (
        <div className="glass-panel p-16 rounded-3xl text-center border-dashed border-2 border-white/10 opacity-70">
           <Camera size={48} className="mx-auto text-gray-600 mb-4" />
           <p className="text-gray-400 font-bold">No funding needs added yet. Start adding items like a Laptop or Camera!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 mt-6">
           {needs.map(need => (
             <div key={need.id} className="glass-panel p-6 rounded-3xl relative overflow-hidden group border border-white/5">
                <div className="absolute top-0 right-0 p-3 rounded-bl-3xl bg-white/5 flex gap-2">
                   <button 
                     onClick={() => handleRemoveNeed(need.id)}
                     className="text-gray-500 hover:text-red-400 transition-colors"
                   >
                     <Trash2 size={16} />
                   </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                   <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                         <h4 className="text-xl font-black">{need.itemName}</h4>
                         <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded cursor-pointer ${need.status === 'received' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : need.status === 'applied' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}`} onClick={() => handleToggleStatus(need.id, need.status)}>
                            {need.status === 'received' ? 'Received ✓' : need.status === 'applied' ? 'Applied' : 'Pending'}
                         </span>
                      </div>
                      
                      <div className="text-cyan-400 font-black text-2xl mb-4">
                         R{need.estimatedCost.toLocaleString()}
                      </div>
                      
                      {need.reason && (
                         <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4">
                            <p className="text-sm font-medium text-gray-300 italic">"{need.reason}"</p>
                         </div>
                      )}
                      
                      {need.appliedTo && (
                         <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                            Applied to: <span className="text-white">{need.appliedTo}</span>
                         </p>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 border-t border-white/5 pt-4">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><LinkIcon size={12} /> Product Link</p>
                          {editingLinkFor === need.id ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                autoFocus
                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none"
                                value={tempLink}
                                onChange={e => setTempLink(e.target.value)}
                                placeholder="https://"
                              />
                              <button onClick={() => handleSaveLink(need.id)} className="bg-emerald-500 hover:bg-emerald-400 text-white rounded p-1"><Check size={16}/></button>
                              <button onClick={() => setEditingLinkFor(null)} className="bg-gray-700 hover:bg-gray-600 rounded p-1"><X size={16}/></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {need.productLink ? (
                                <a href={need.productLink} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:underline truncate max-w-[200px]">{need.productLink}</a>
                              ) : (
                                <span className="text-sm text-gray-600 italic">No link added</span>
                              )}
                              <button onClick={() => {setTempLink(need.productLink || ''); setEditingLinkFor(need.id);}} className="text-gray-500 hover:text-white text-xs ml-2 underline">Edit</button>
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><FileText size={12} /> Quotation PDF</p>
                           {need.quotationDocName ? (
                             <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded px-3 py-1.5 w-fit">
                               <FileText size={14} className="text-emerald-400" />
                               <span className="text-sm font-bold truncate max-w-[150px]">{need.quotationDocName}</span>
                               <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded ml-1">Vault</span>
                             </div>
                           ) : (
                             <div>
                               {uploadingQuotationFor === need.id ? (
                                 <div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-gray-400" /><span className="text-xs text-gray-400">Uploading...</span></div>
                               ) : (
                                 <button onClick={() => {setUploadingQuotationFor(need.id); fileInputRef.current?.click();}} className="text-xs flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors text-gray-300">
                                   <Upload size={14} /> Upload PDF to Vault
                                 </button>
                               )}
                             </div>
                           )}
                        </div>
                      </div>
                   </div>

                   <div className="w-full lg:w-72 space-y-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Generate Document</p>
                      <button 
                        onClick={() => handleGeneratePitchDeck(need)}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all text-left"
                      >
                         <div className="flex items-center gap-3">
                           <PenTool size={16} className="text-cyan-400" />
                           <span className="text-xs font-bold">Funding Proposal</span>
                         </div>
                         <ChevronRight size={14} className="text-gray-600" />
                      </button>
                      
                      <button 
                        onClick={() => handleGenerateProposal('businessplan', need)}
                        disabled={isGeneratingProposal}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-left"
                      >
                         <div className="flex items-center gap-3">
                           <BarChart3 size={16} className="text-indigo-400" />
                           <span className="text-xs font-bold">Business Plan</span>
                         </div>
                         <ChevronRight size={14} className="text-gray-600" />
                      </button>

                      <button 
                        onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(need.itemName + " price South Africa")}`, '_blank')}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left mt-2"
                      >
                         <div className="flex items-center gap-3">
                           <Search size={16} className="text-emerald-400" />
                           <span className="text-xs font-bold">Find Quotations</span>
                         </div>
                         <ChevronRight size={14} className="text-gray-600" />
                      </button>
                   </div>
                </div>
             </div>
           ))}
        </div>
      )}

      {isGeneratingProposal && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
           <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
           <p className="text-lg font-black text-white animate-pulse">Generating your custom document...</p>
        </div>
      )}

      {generatedBusinessPlanData && (
        <BusinessPlanDocument
           data={generatedBusinessPlanData}
           businessInfo={{...businessInfo, ...ownerInfo}}
           title={generatedBusinessPlanData.docType}
           onClose={() => setGeneratedBusinessPlanData(null)}
        />
      )}

      {generatedPitchDeckData && (
        <PitchDeckDocument
           data={generatedPitchDeckData}
           businessInfo={{...businessInfo, ...ownerInfo}}
           title="Pitch Deck"
           onClose={() => setGeneratedPitchDeckData(null)}
        />
      )}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".pdf" 
        onChange={e => uploadingQuotationFor && handleUploadQuotation(e, uploadingQuotationFor)} 
      />
    </div>
  );
};

export default FundingNeedsTracker;


import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Filter, Search, Loader2, AlertTriangle, ExternalLink, Zap } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { FundingOpportunity } from '../types';
import ApplicationModal from '../components/ApplicationModal';

interface MarketplaceProps {
  user: any;
  activeOpportunityId: string | null;
  onGoToDashboard: () => void;
  onSetActiveOpportunity: (id: string | null) => void;
  onUpgrade: () => void;
}

const Marketplace: React.FC<MarketplaceProps> = ({ user, activeOpportunityId, onSetActiveOpportunity, onUpgrade }) => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<FundingOpportunity | null>(null);

  // Use VITE_GEMINI_API_KEY from environment, with process.env fallback
  const rawKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  const apiKey = rawKey.trim();

  // Safe initialization of GenAI
  const getGenAI = () => {
    if (!apiKey || apiKey === "YOUR_VALID_GEMINI_API_KEY_HERE") return null;
    return new GoogleGenerativeAI(apiKey);
  };
  
  const genAI = getGenAI();

  useEffect(() => {
     if (apiKey && apiKey !== "YOUR_VALID_GEMINI_API_KEY_HERE") {
       console.log("Marketplace: API Key loaded (last 4 chars):", apiKey.slice(-4));
     } else {
       console.log("Marketplace: API Key missing or placeholder");
     }
  }, [apiKey]);

  const fetchOpportunities = async () => {
    setIsScanning(true);
    setError(null);
    
    // Clear existing state before fetch
    setOpportunities([]);

    try {
      if (!genAI) {
        // Just return or show info, don't crash with "API Key is missing" if we want to fallback gracefully
      }
      
      const oppsRef = collection(db, 'funding_opportunities');
      const oppSnapshot = await getDocs(oppsRef);
      const fetchedOpps = oppSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingOpportunity));
      
      if (fetchedOpps.length === 0) {
        // Fallback to AI generation if database is empty
        console.warn("No opportunities found in Firestore, falling back to AI generation.");
        await generateAndFetchOpportunities();
      } else {
        setOpportunities(fetchedOpps);
      }
    } catch (e: any) {
      console.error("Error fetching opportunities:", e);
      setError(e.message || "Failed to fetch funding opportunities. Please try again later.");
    } finally {
      setIsScanning(false);
    }
  };
  
  const generateAndFetchOpportunities = async () => {
      if (!genAI) {
         throw new Error("API Key is missing or invalid. Please set VITE_GEMINI_API_KEY in your .env file.");
      }

      console.log("Generating opportunities with AI...");
      // Switched to gemini-2.0-flash as the generic alias
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `
        Find 10-12 distinct, currently active business funding opportunities, grants, enterprise development programs, or loan schemes available in South Africa for 2025/2026.
        Prioritize reliable sources like government agencies (NYDA, SEFA, IDC), major banks (Standard Bank, FNB, Nedbank), and established private foundations (Tony Elumelu, Allan Gray).
        Ensure the opportunities are specifically for SMEs or startups.
        For each opportunity, return a JSON object with the following fields: "title", "provider", "amountRange", "deadline", "description", and "tags" (an array of strings).
        Return a single valid JSON array of these objects. Do not include markdown formatting.
      `;

      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        // Clean up potential markdown code blocks
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const parsedOpps = JSON.parse(text);
        // Add temporary IDs
        const oppsWithIds = parsedOpps.map((opp: any, index: number) => ({ ...opp, id: `gen-${index}` }));
        setOpportunities(oppsWithIds);
        
        // Save to Firestore in background
        try {
          const oppsRef = collection(db, 'funding_opportunities');
          for (const opp of parsedOpps) {
            await addDoc(oppsRef, opp);
          }
        } catch (error) {
          console.error('Error saving opportunities to Firestore:', error);
        }
      } catch (e: any) {
        console.error("AI Generation Error:", e);
        setError("Failed to generate opportunities with AI. The service may be temporarily unavailable.");
      }
  };


  useEffect(() => {
    fetchOpportunities();
  }, []);

  const filteredOpportunities = useMemo(() => {
    if (!opportunities) return [];
    return opportunities.filter(opp => {
      const searchLower = searchTerm.toLowerCase();
      return (
        (opp.title && opp.title.toLowerCase().includes(searchLower)) ||
        (opp.provider && opp.provider.toLowerCase().includes(searchLower)) ||
        (opp.tags && opp.tags.some(tag => tag.toLowerCase().includes(searchLower)))
      );
    });
  }, [opportunities, searchTerm]);

  const handleApplyClick = (opp: FundingOpportunity) => {
      setSelectedOpportunity(opp);
  }

  const closeApplicationModal = () => {
      setSelectedOpportunity(null);
  }


  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {selectedOpportunity && (
        <ApplicationModal 
            user={user} 
            opportunity={selectedOpportunity} 
            onClose={closeApplicationModal} 
            onUpgrade={onUpgrade}
        />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black mb-2 flex items-center gap-3">
            Funding Marketplace <Sparkles size={28} className="text-cyan-400" />
          </h1>
          <p className="text-gray-400 font-medium">
            AI-curated list of grants, loans, and programs for your business.
          </p>
        </div>
        <button 
          onClick={fetchOpportunities}
          disabled={isScanning}
          className="bg-cyan-500/10 text-cyan-400 px-5 py-3 rounded-xl font-bold flex items-center gap-2 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanning ? <><Loader2 size={18} className="animate-spin" /> Refreshing...</> : 'Refresh List'}
        </button>
      </div>
      
      <div className="relative mb-8">
        <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500" />
        <input 
          type="text"
          placeholder="Search by name, provider, or tag (e.g. 'tech', 'youth')"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-lg placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
        />
      </div>

      {isScanning && opportunities.length === 0 && (
         <div className="flex flex-col items-center justify-center text-center p-16 glass-panel rounded-3xl">
           <Loader2 size={40} className="animate-spin text-cyan-400 mb-6"/>
           <h3 className="text-xl font-bold">Scanning for Opportunities...</h3>
           <p className="text-gray-400">Our AI is curating the latest funding options for you.</p>
         </div>
      )}

      {error && !isScanning && (
        <div className="flex flex-col items-center justify-center text-center p-16 bg-red-500/10 rounded-3xl mb-8">
          <AlertTriangle size={40} className="text-red-400 mb-6"/>
          <h3 className="text-xl font-bold text-red-400">An Error Occurred</h3>
          <p className="text-red-400/80 mb-4">{error}</p>
          <button 
            onClick={fetchOpportunities}
            className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg text-sm font-bold hover:bg-red-500/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
      
      {!isScanning && !error && filteredOpportunities.length === 0 && (
        <div className="text-center p-16 glass-panel rounded-3xl">
          <h3 className="text-xl font-bold">No Matches Found</h3>
          <p className="text-gray-400">Try adjusting your search terms or check back later for new opportunities.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOpportunities.map((opp, idx) => (
          <div key={opp.id || idx} className="glass-panel p-7 rounded-3xl flex flex-col group hover:border-cyan-500/30 transition-all cursor-pointer" onClick={() => handleApplyClick(opp)}>
            <div className="flex-grow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold pr-4 group-hover:text-cyan-400 transition-colors">{opp.title}</h3>
                <span className="text-xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded-md whitespace-nowrap">{opp.provider}</span>
              </div>
              <p className="text-sm text-gray-400 mb-4 h-20 overflow-hidden line-clamp-3">{opp.description}</p>
            </div>
            <div className="mt-auto">
                <div className="flex flex-wrap gap-2 mb-5">
                  {opp.tags && opp.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded-full uppercase tracking-wider text-gray-400">{tag}</span>
                  ))}
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Amount</p>
                    <p className="font-semibold text-white">{opp.amountRange}</p>
                  </div>
                   <button onClick={(e) => { e.stopPropagation(); handleApplyClick(opp); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-cyan-500 hover:text-white text-gray-400 transition-all font-bold text-sm">
                     <Zap size={16} /> Apply
                   </button>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;
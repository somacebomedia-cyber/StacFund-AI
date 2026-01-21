
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Filter, Search, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { FundingOpportunity } from '../types';

const Marketplace: React.FC = () => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  const fetchOpportunities = async () => {
    setIsScanning(true);
    setError(null);
    try {
      if (!apiKey) {
        throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in your .env file.");
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
      console.log("Generating opportunities with AI...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `
        Find 10-12 distinct, currently active business funding opportunities, grants, enterprise development programs, or loan schemes available in South Africa for 2025/2026.
        Prioritize reliable sources like government agencies (NYDA, SEFA, IDC), major banks (Standard Bank, FNB, Nedbank), and established private foundations (Tony Elumelu, Allan Gray).
        Ensure the opportunities are specifically for SMEs or startups.
        For each opportunity, return a JSON object with the following fields: "id" (a unique string), "title", "provider", "amountRange", "deadline", "description", and "tags" (an array of strings).
        Return a single valid JSON array of these objects.
      `;

      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '');
        const parsedOpps = JSON.parse(text);
        setOpportunities(parsedOpps);
        // Here you would ideally save these to Firestore for future use
      } catch (e: any) {
        console.error("AI Generation Error:", e);
        setError("Failed to generate opportunities with AI. The service may be temporarily unavailable.");
      }
  };


  useEffect(() => {
    fetchOpportunities();
  }, []);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(opp => 
      opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [opportunities, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
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

      {error && (
        <div className="flex flex-col items-center justify-center text-center p-16 bg-red-500/10 rounded-3xl">
          <AlertTriangle size={40} className="text-red-400 mb-6"/>
          <h3 className="text-xl font-bold text-red-400">An Error Occurred</h3>
          <p className="text-red-400/80">{error}</p>
        </div>
      )}
      
      {!isScanning && !error && filteredOpportunities.length === 0 && (
        <div className="text-center p-16 glass-panel rounded-3xl">
          <h3 className="text-xl font-bold">No Matches Found</h3>
          <p className="text-gray-400">Try adjusting your search terms or check back later for new opportunities.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOpportunities.map(opp => (
          <div key={opp.id} className="glass-panel p-7 rounded-3xl flex flex-col group hover:border-cyan-500/30 transition-all">
            <div className="flex-grow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold pr-4 group-hover:text-cyan-400 transition-colors">{opp.title}</h3>
                <span className="text-xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded-md whitespace-nowrap">{opp.provider}</span>
              </div>
              <p className="text-sm text-gray-400 mb-4 h-20 overflow-hidden">{opp.description}</p>
            </div>
            <div className="mt-auto">
                <div className="flex flex-wrap gap-2 mb-5">
                  {opp.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded-full uppercase tracking-wider text-gray-400">{tag}</span>
                  ))}
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Amount</p>
                    <p className="font-semibold text-white">{opp.amountRange}</p>
                  </div>
                   <a href="#" className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 group-hover:text-white transition-all">
                     <ExternalLink size={20} />
                   </a>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;

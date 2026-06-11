import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageCircle, FileText, CheckCircle, Database, PhoneIncoming, AlertTriangle, ScanLine, Loader2, Target, Link as LinkIcon, Building } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { User, FundingType } from '../types';

interface WhatsAppIngestionProps {
  user: User | null;
  onClose: () => void;
}

// Mock of incoming WhatsApp messages with images attached
const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    from: '+27 82 555 0199',
    timestamp: 'Just now',
    image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=2936',
    caption: 'Hey StacFund, I saw this municipality notice at the local office. Is it legit?',
    status: 'pending' // pending, extracting, processed
  },
  {
    id: 'msg-2',
    from: '+27 71 222 9384',
    timestamp: '2 hours ago',
    image: 'https://images.unsplash.com/photo-1590402236541-692a8b9f4852?auto=format&fit=crop&q=80&w=2609',
    caption: 'Forwarded funding poster',
    status: 'pending'
  }
];

export const WhatsAppIngestion: React.FC<WhatsAppIngestionProps> = ({ user, onClose }) => {
  const [messages, setMessages] = useState<typeof MOCK_MESSAGES>(MOCK_MESSAGES);
  const [selectedMsg, setSelectedMsg] = useState<typeof MOCK_MESSAGES[0] | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [botNumber, setBotNumber] = useState<string>('+27 79 448 6843');
  const [isEditingNumber, setIsEditingNumber] = useState(false);

  const simulateExtraction = async (msg: typeof MOCK_MESSAGES[0]) => {
    setIsExtracting(true);
    setError(null);
    setExtractedData(null);
    
    // In a real implementation:
    // We would pass the actual image binary/base64 to Gemini Pro Vision.
    // Here we'll simulate the AI call with dummy data reflecting the poster the user showed.
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // We do a mock prompt just to show interaction, but return static JSON for the demo
      // because we cannot read the exact physical file safely here without the real image payload.
      await new Promise(res => setTimeout(res, 2000));
      
      const mockResult = {
        programme_name: "Local MSMEs and Co-operatives Support Grant",
        issuer_name: "Johannes Phumani Phungula Local Municipality",
        issuer_type: "Local Municipality",
        status: "OPEN",
        funding_type: FundingType.GRANT,
        target_stage: "Informal, Small to Medium Enterprises",
        amount_min: 0,
        amount_max: 300000,
        eligibility_summary: "Local entrepreneurs operating within the municipality boundaries, with a clear business plan. Previously disadvantaged.",
        required_documents: ["Completed Application Form", "Business Plan", "ID Copies", "Valid SARS Tax Pin", "BBBEE Certificate", "Bank Statements"],
        closing_date: "30 JUNE 2026",
        contact_email: "nhmkhize@jppmunicipality.gov.za"
      };
      
      setExtractedData(mockResult);
    } catch (err: any) {
      setError(err.message || 'Failed to extract data.');
    } finally {
      setIsExtracting(false);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'processed' } : m));
    }
  };

  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const handlePublish = () => {
    setPublishStatus('publishing');
    setTimeout(() => {
      setPublishStatus('success');
      setTimeout(() => {
         setSelectedMsg(null);
         setExtractedData(null);
         setPublishStatus(null);
      }, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-5xl h-[85vh] bg-[#050510] border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Left pane: Inbox */}
        <div className="w-full md:w-80 border-r border-white/5 bg-white/5 flex flex-col hidden-scrollbar">
          <div className="p-5 border-b border-white/5">
            <h2 className="text-lg font-black flex items-center gap-2">
              <MessageCircle className="text-emerald-400" /> WhatsApp Intake
            </h2>
            <p className="text-xs text-gray-500 mt-1">Crowdsourced local funding flyers.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <button
                key={msg.id}
                onClick={() => {
                  setSelectedMsg(msg);
                  setExtractedData(null);
                }}
                className={`w-full text-left p-3 rounded-2xl border transition-all ${selectedMsg?.id === msg.id ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#111] border-white/5 hover:border-white/20'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold font-mono text-gray-400">{msg.from}</span>
                  <span className="text-[10px] text-gray-600">{msg.timestamp}</span>
                </div>
                <div className="text-xs text-gray-300 line-clamp-2 mb-2">{msg.caption}</div>
                <div className="flex items-center justify-between mt-2">
                  <div className="h-12 w-12 rounded overflow-hidden relative">
                     <img src={msg.image} alt="Forwarded document" className="w-full h-full object-cover opacity-70" />
                     {msg.status === 'processed' && (
                       <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-[1px]">
                         <CheckCircle size={14} className="text-emerald-400" />
                       </div>
                     )}
                  </div>
                  <div className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${msg.status === 'processed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-500'}`}>
                    {msg.status}
                  </div>
                </div>
              </button>
            ))}

            <div className="mt-8 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-center relative group">
              <PhoneIncoming size={20} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Receiving Number</p>
              {isEditingNumber ? (
                <input
                  type="text"
                  value={botNumber}
                  onChange={(e) => setBotNumber(e.target.value)}
                  onBlur={() => setIsEditingNumber(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingNumber(false)}
                  autoFocus
                  className="w-full bg-black/50 border border-emerald-500/30 rounded px-2 py-1 text-center text-lg font-black font-mono text-emerald-400 outline-none"
                />
              ) : (
                <p 
                  className="text-lg font-black font-mono cursor-pointer hover:text-emerald-300 transition-colors"
                  onClick={() => setIsEditingNumber(true)}
                  title="Click to edit"
                >
                  {botNumber}
                </p>
              )}
              <p className="text-[10px] text-gray-500 mt-2 mb-3">Click to change. You can use your own number for testing.</p>
              
              <a 
                href={`https://wa.me/${botNumber.replace(/[^0-9]/g, '')}?text=Hi%20StacFund%2C%20here%20is%20a%20funding%20poster`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-xs uppercase tracking-wider transition-all"
              >
                <MessageCircle size={14} /> Open WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* Right pane: Extractor workspace */}
        <div className="flex-1 flex flex-col bg-[#020205] relative overflow-hidden">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 transition-colors z-20"
          >
            <X size={20} />
          </button>
          
          {!selectedMsg ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <ScanLine size={48} className="text-gray-700 mb-4" />
              <h3 className="text-xl font-black text-gray-500">Select a Message</h3>
              <p className="text-gray-600 text-sm mt-2 max-w-sm">
                Choose a forwarded poster from the inbox to extract structured funding data.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-y-auto hidden-scrollbar">
              <div className="p-6 border-b border-white/5 bg-[#050510] flex gap-6">
                <div className="w-48 h-64 rounded-xl border border-white/10 overflow-hidden shrink-0 relative bg-[#111]">
                   <img src={selectedMsg.image} alt="Document View" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col justify-between py-2">
                   <div>
                     <h3 className="text-lg font-bold flex items-center gap-2"><FileText size={18} className="text-emerald-400" /> Shared Image</h3>
                     <p className="text-sm text-gray-400 mt-2">"{selectedMsg.caption}"</p>
                     <p className="text-xs text-gray-500 mt-1 font-mono">From: {selectedMsg.from}</p>
                   </div>
                   
                   {!extractedData && !isExtracting && (
                     <button 
                       onClick={() => simulateExtraction(selectedMsg)}
                       className="self-start mt-4 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-colors flex items-center gap-2"
                     >
                       <ScanLine size={16} /> Run Vision Extraction
                     </button>
                   )}
                   {isExtracting && (
                     <div className="self-start mt-4 flex items-center gap-3 text-emerald-400 text-sm font-bold">
                       <Loader2 size={16} className="animate-spin" /> Analyzing Image with Gemini Vision...
                     </div>
                   )}
                </div>
              </div>

              {/* Data Review Pane */}
              <div className="flex-1 p-6 relative">
                 {extractedData ? (
                   <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
                     <div className="flex justify-between items-end mb-6">
                       <div>
                         <h4 className="text-xl font-black flex items-center gap-2">
                           <Target className="text-emerald-400" /> Extracted Funding Profile
                         </h4>
                         <p className="text-xs text-gray-500 mt-1">Review the AI extracted payload before deploying to the public database.</p>
                       </div>
                     </div>
                     
                     <div className="space-y-4">
                       <div className="glass-panel p-4 py-3 rounded-xl border border-white/5 flex gap-4">
                         <div className="w-1/3 text-xs font-bold text-gray-500 uppercase">Provider</div>
                         <div className="w-2/3 text-sm font-medium">{extractedData.issuer_name}</div>
                       </div>
                       <div className="glass-panel p-4 py-3 rounded-xl border border-white/5 flex gap-4">
                         <div className="w-1/3 text-xs font-bold text-gray-500 uppercase">Programme</div>
                         <div className="w-2/3 text-sm font-medium">{extractedData.programme_name}</div>
                       </div>
                       <div className="glass-panel p-4 py-3 rounded-xl border border-white/5 flex gap-4">
                         <div className="w-1/3 text-xs font-bold text-gray-500 uppercase">Funding Range (ZAR)</div>
                         <div className="w-2/3 text-sm font-medium">R {extractedData.amount_min.toLocaleString()} — R {extractedData.amount_max.toLocaleString()}</div>
                       </div>
                       <div className="glass-panel p-4 py-3 rounded-xl border border-white/5 flex gap-4">
                         <div className="w-1/3 text-xs font-bold text-gray-500 uppercase">Target Audience</div>
                         <div className="w-2/3 text-sm font-medium">{extractedData.target_stage}</div>
                       </div>
                       <div className="glass-panel p-4 py-3 rounded-xl border border-white/5 flex flex-col gap-2">
                         <div className="text-xs font-bold text-gray-500 uppercase">Eligibility Criteria</div>
                         <div className="text-sm font-medium text-gray-300 leading-relaxed bg-[#111] p-3 rounded-lg border border-white/5">
                           {extractedData.eligibility_summary}
                         </div>
                       </div>
                       <div className="glass-panel p-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex justify-between items-center">
                         <div>
                           <div className="text-xs font-bold text-emerald-500 uppercase">Closing Date</div>
                           <div className="text-lg font-black text-emerald-400 mt-1">{extractedData.closing_date}</div>
                         </div>
                         <div className="text-right">
                           <div className="text-xs font-bold text-gray-500 uppercase">Contact</div>
                           <div className="text-sm font-medium mt-1">{extractedData.contact_email}</div>
                         </div>
                       </div>
                     </div>
                     
                     <div className="my-8 flex justify-end">
                       <button
                         onClick={handlePublish}
                         disabled={publishStatus !== null}
                         className={`px-8 py-3 rounded-xl text-black font-black text-sm uppercase tracking-wider transition-all flex items-center gap-2 ${publishStatus === 'publishing' ? 'bg-amber-400' : publishStatus === 'success' ? 'bg-blue-400' : 'bg-emerald-400 hover:bg-emerald-300'}`}
                       >
                         {publishStatus === 'publishing' ? (
                           <><Loader2 size={18} className="animate-spin" /> Syncing to DB...</>
                         ) : publishStatus === 'success' ? (
                           <><CheckCircle size={18} /> Published Successfully</>
                         ) : (
                           <><Database size={18} /> Approve & Publish</>
                         )}
                       </button>
                     </div>
                   </div>
                 ) : (
                   <div className="h-full flex items-center justify-center">
                     <p className="text-sm text-gray-600 font-bold opacity-50">Click "Run Vision Extraction" above.</p>
                   </div>
                 )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
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
        // @ts-ignore
        const html2pdf = (await import('html2pdf.js')).default;
        
        const opt = {
            margin: 0,
            filename: `${businessInfo.name?.replace(/\s+/g, '_') || 'Business'}_${title.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: 'css', avoid: '.page-break-avoid' }
        };
        
        await html2pdf().set(opt).from(printRef.current).save();
    } catch (e) {
        console.error('PDF Export failed:', e);
        // Fallback to standard print if it fails
        window.print();
    } finally {
        setIsExporting(false);
    }
  };

  useEffect(() => {
    // Automatically trigger print dialog when component mounts
    // Might be intrusive, let's keep it manual
  }, []);

  const PageHeader = () => (
    <div className="border-b border-gray-200 pb-4 mb-8 flex justify-between items-center text-sm font-bold text-gray-400">
       <span className="uppercase tracking-widest text-[#2E1A47]/60">{title}</span>
       <span>{businessInfo.name || 'NeoTech Industries'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto w-full custom-scrollbar">
      {/* Print Styles */}
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
            background: white !important;
            color: black !important;
          }
          .page-break { page-break-after: always; break-after: page; }
          .no-print { display: none !important; }
          
          /* Ensures background colors are printed */
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
          {isExporting ? 'Generating PDF (This may take a moment)...' : 'Export High Quality PDF'}
        </button>
        <button 
          onClick={onClose}
          className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
        >
          <X size={24} />
        </button>
      </div>

      <div ref={printRef} className="print-container w-full max-w-[210mm] bg-white min-h-[297mm] shadow-2xl relative my-12 mx-auto flex flex-col text-gray-900 font-sans">
        
        {/* Cover Page */}
        <div className="w-full h-[297mm] relative flex flex-col p-16 page-break bg-[#0B0D17] overflow-hidden">
            <div className="flex-1 flex flex-col justify-center">
               <p className="text-gray-300 text-2xl mb-2 font-medium break-words">{title}</p>
               <h1 className="text-5xl font-bold text-white leading-tight tracking-tight mb-4 break-words">
                 {businessInfo.name || 'NeoTech Industries'}
               </h1>
               <p className="text-xl text-gray-400">Prepared by {businessInfo.ownerInfo?.name || 'Founder'}</p>
            </div>
            
            <div className="mt-auto grid grid-cols-2 gap-4 text-gray-400 text-sm break-words">
               <div className="pr-4">
                  <p className="truncate">{businessInfo.email || 'contact@business.com'}</p>
                  <p className="mt-1">{businessInfo.whatsapp || '+27 00 000 0000'}</p>
               </div>
               <div className="text-right pl-4">
                  <p className="truncate">{businessInfo.registration || 'Registration Number'}</p>
                  <p className="mt-1">South Africa</p>
               </div>
            </div>

            {businessInfo.logoUrl && (
              <div className="absolute top-16 right-16 w-32 h-32 bg-white rounded-xl p-3 flex items-center justify-center overflow-hidden shadow-2xl shrink-0">
                <img src={businessInfo.logoUrl} alt="Startup Logo" className="max-w-full max-h-full object-contain" />
              </div>
            )}
        </div>

        {/* Content Pages Template Component */}
        
        {/* Executive Summary */}
        <div className="w-full h-[297mm] p-16 bg-white page-break flex flex-col overflow-hidden">
            <PageHeader />
            <h2 className="text-4xl font-bold text-[#2E1A47] mb-6 pb-4 border-b border-gray-100 shrink-0">Executive Summary</h2>
            <div className="w-full bg-[#FCF8F5] rounded-xl p-6 mb-6 border border-[#F2EAE5] shrink-0">
                <p className="text-lg text-[#785E93] font-medium leading-relaxed italic line-clamp-4">
                   "{businessInfo.description || data.executiveSummary?.substring(0, 150) + '...'}"
                </p>
            </div>
            <div className="text-gray-700 leading-relaxed space-y-4 text-sm text-justify overflow-hidden flex-1 relative">
                <div className="absolute inset-0 overflow-hidden">
                  {data.executiveSummary?.split('\n').map((paragraph: string, i: number) => (
                     paragraph.trim() && <p key={i}>{paragraph}</p>
                  ))}
                </div>
            </div>
            <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">3</div>
        </div>

        {/* SWOT Analysis */}
        {data.swot && (
          <div className="w-full h-[297mm] p-16 bg-white page-break flex flex-col overflow-hidden">
              <PageHeader />
              <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">SWOT Analysis</h2>
              
              <div className="grid grid-cols-2 gap-6 flex-1 overflow-hidden">
                 <div className="bg-[#F8FBFE] p-6 rounded-2xl border border-[#E1EEFA] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-black shrink-0">S</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Strengths</h3>
                    </div>
                    <ul className="space-y-3 overflow-hidden flex-1">
                      {data.swot.strengths?.slice(0, 5).map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-blue-400 mt-0.5 shrink-0">•</span> <span className="line-clamp-3">{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
                 
                 <div className="bg-[#FEF8F8] p-6 rounded-2xl border border-[#FAE1E1] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center text-red-600 font-black shrink-0">W</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Weaknesses</h3>
                    </div>
                    <ul className="space-y-3 overflow-hidden flex-1">
                      {data.swot.weaknesses?.slice(0, 5).map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-red-400 mt-0.5 shrink-0">•</span> <span className="line-clamp-3">{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
                 
                 <div className="bg-[#F6FEF9] p-6 rounded-2xl border border-[#E1FBEB] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 font-black shrink-0">O</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Opportunities</h3>
                    </div>
                    <ul className="space-y-3 overflow-hidden flex-1">
                      {data.swot.opportunities?.slice(0, 5).map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-emerald-400 mt-0.5 shrink-0">•</span> <span className="line-clamp-3">{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
                 
                 <div className="bg-[#FEFAF5] p-6 rounded-2xl border border-[#FBEAD4] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center text-orange-600 font-black shrink-0">T</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Threats</h3>
                    </div>
                    <ul className="space-y-3 overflow-hidden flex-1">
                      {data.swot.threats?.slice(0, 5).map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-orange-400 mt-0.5 shrink-0">•</span> <span className="line-clamp-3">{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
              </div>
              <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">4</div>
          </div>
        )}

        {/* Market Research */}
        {data.marketResearch && (
           <div className="w-full h-[297mm] p-16 bg-white page-break flex flex-col overflow-hidden">
             <PageHeader />
             <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Market Research</h2>
             
             <div className="grid grid-cols-3 gap-6 mb-8 shrink-0">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col justify-center overflow-hidden">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 truncate">Total Market</p>
                   <p className="text-2xl font-bold text-[#2E1A47] break-words line-clamp-2">{data.marketResearch.tam || 'ZAR 500M'}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col justify-center overflow-hidden">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 truncate">Serviceable Market</p>
                   <p className="text-2xl font-bold text-[#2E1A47] break-words line-clamp-2">{data.marketResearch.sam || 'ZAR 100M'}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col justify-center overflow-hidden">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 truncate">Obtainable Market</p>
                   <p className="text-2xl font-bold text-[#2E1A47] break-words line-clamp-2">{data.marketResearch.som || 'ZAR 10M'}</p>
                </div>
             </div>
             
             <h3 className="text-xl font-bold text-[#2E1A47] mb-4 shrink-0">Target Audience</h3>
             <div className="bg-[#F8F9FA] p-6 rounded-xl border border-gray-100 mb-6 shrink-0 overflow-hidden">
                 <ul className="space-y-3 text-gray-700">
                    {data.marketResearch.targetAudience?.slice(0, 4).map((t: string, i: number) => (
                       <li key={i} className="flex gap-4 items-start">
                           <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                           <span className="leading-relaxed text-sm line-clamp-2">{t}</span>
                       </li>
                    ))}
                 </ul>
             </div>
             
             <h3 className="text-xl font-bold text-[#2E1A47] mb-4 shrink-0">Competitor Analysis</h3>
             <div className="text-gray-600 leading-relaxed text-sm text-justify overflow-hidden flex-1 relative">
                <div className="absolute inset-0 overflow-hidden line-clamp-[10]">
                  {data.marketResearch.competitorAnalysis}
                </div>
             </div>
             
             <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">5</div>
           </div>
        )}
        
        {/* Products & Services */}
        {data.productsServices && (
           <div className="w-full h-[297mm] p-16 bg-white page-break flex flex-col overflow-hidden">
             <PageHeader />
             <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Products & Services</h2>
             <div className="space-y-6 flex-1 overflow-hidden">
               {data.productsServices?.slice(0, 4).map((item: any, i: number) => (
                 <div key={i} className="p-6 border border-gray-100 rounded-2xl bg-white shadow-sm flex items-start gap-6 overflow-hidden">
                    <div className="w-10 h-10 shrink-0 rounded-full border-2 border-indigo-100 flex items-center justify-center text-indigo-500 font-bold text-lg">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-[#2E1A47] mb-2 truncate">{item.name}</h3>
                        <p className="text-gray-600 leading-relaxed mb-4 text-xs line-clamp-3">{item.description}</p>
                        
                        <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-indigo-50 rounded-lg max-w-full">
                           <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest shrink-0">Pricing Strategy</span>
                           <span className="font-bold text-indigo-900 text-sm truncate">{item.pricing}</span>
                        </div>
                    </div>
                 </div>
               ))}
             </div>
             <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">6</div>
           </div>
        )}
        
        {/* Financial Plan */}
        {data.financialPlan && (
           <div className="w-full h-[297mm] p-16 bg-white page-break flex flex-col overflow-hidden">
             <PageHeader />
             <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Financial Plan</h2>
             
             <div className="mb-10 flex gap-6 shrink-0 h-[220px]">
                <div className="w-1/2 bg-[#2E1A47] p-8 rounded-3xl text-white flex flex-col overflow-hidden">
                   <p className="text-xs text-[#A592C4] font-bold uppercase tracking-widest mb-3 shrink-0">Funding Required</p>
                   <p className="text-3xl font-black mb-3 break-words line-clamp-2 shrink-0">{data.financialPlan.fundingRequirement}</p>
                   <div className="w-full h-[1px] bg-white/10 mb-4 shrink-0"></div>
                   <p className="text-[#D3C7E8] font-medium leading-relaxed text-sm line-clamp-4 overflow-hidden">{data.financialPlan.fundingPurpose}</p>
                </div>
                <div className="w-1/2 p-6 border border-gray-100 rounded-3xl bg-[#F8F9FA] flex flex-col overflow-hidden">
                   <h3 className="text-base font-bold text-[#2E1A47] mb-4 shrink-0">Use of Funds Allocation</h3>
                   <div className="space-y-3 overflow-hidden flex-1 pr-2 custom-scrollbar">
                      {data.financialPlan.useOfFunds?.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-center pb-3 border-b border-gray-200 last:border-0">
                           <span className="text-gray-600 font-medium text-xs break-words pr-4 flex-1">{item.category}</span>
                           <span className="font-bold text-[#2E1A47] text-sm shrink-0 whitespace-nowrap">{item.amount}</span>
                        </div>
                      ))}
                   </div>
                 </div>
             </div>
             
             <h3 className="text-xl font-bold text-[#2E1A47] mb-6 shrink-0">3-Year Revenue Projections</h3>
             <div className="grid grid-cols-3 gap-6 shrink-0">
                 <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                   <div className="w-full flex justify-between items-center mb-4">
                      <span className="text-sm font-bold text-gray-400">Year 1</span>
                      <div className="w-2 h-2 rounded-full bg-indigo-200"></div>
                   </div>
                   <div className="h-20 w-full bg-gradient-to-t from-indigo-50 to-white rounded-lg flex items-end justify-center pb-3 px-2 overflow-hidden">
                      <p className="text-xl font-black text-[#2E1A47] truncate">{data.financialPlan.revenueProjections?.y1 || '-'}</p>
                   </div>
                 </div>
                 <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                   <div className="w-full flex justify-between items-center mb-4">
                      <span className="text-sm font-bold text-gray-400">Year 2</span>
                      <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                   </div>
                   <div className="h-20 w-full bg-gradient-to-t from-indigo-100 to-white rounded-lg flex items-end justify-center pb-3 px-2 overflow-hidden">
                      <p className="text-xl font-black text-[#2E1A47] truncate">{data.financialPlan.revenueProjections?.y2 || '-'}</p>
                   </div>
                 </div>
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md transform scale-105 flex flex-col items-center justify-center relative">
                   <div className="absolute -top-3 bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg">Target</div>
                   <div className="w-full flex justify-between items-center mb-4 pt-1">
                      <span className="text-sm font-bold text-indigo-400">Year 3</span>
                      <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                   </div>
                   <div className="h-24 w-full bg-gradient-to-t from-indigo-200 to-white rounded-lg flex items-end justify-center pb-3 px-2 overflow-hidden">
                      <p className="text-xl font-black text-[#2E1A47] truncate">{data.financialPlan.revenueProjections?.y3 || '-'}</p>
                   </div>
                 </div>
             </div>
             
             <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">7</div>
           </div>
        )}

      </div>
    </div>
  );
};

export default BusinessPlanDocument;


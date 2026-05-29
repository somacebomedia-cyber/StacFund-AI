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
        <div className="w-full min-h-[297mm] relative flex flex-col p-16 page-break bg-[#05050A]">
            {/* Ambient Background Mesh */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/30 rounded-full blur-[120px] mix-blend-screen"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[700px] h-[700px] bg-purple-900/30 rounded-full blur-[140px] mix-blend-screen"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[100px] mix-blend-screen"></div>
                
                {/* Dot grid pattern overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/50 to-black/80"></div>
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            </div>

            <div className="flex-1 flex flex-col justify-center relative z-10 h-full max-w-3xl">
               <div className="w-24 h-1.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 mb-10 rounded-full"></div>
               <p className="text-indigo-300 text-xl font-bold uppercase tracking-[0.3em] mb-4">{title}</p>
               <h1 className="text-[5rem] font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-gray-400 leading-[1] tracking-tighter mb-8 break-words drop-shadow-sm">
                 {businessInfo.name || 'NeoTech Industries'}
               </h1>
               <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md inline-block max-w-xl">
                 <p className="text-xl text-gray-300 leading-relaxed font-light">
                   A comprehensive strategic proposal and operating plan designed for growth and scale.
                 </p>
                 <p className="text-sm font-bold text-gray-400 mt-4 uppercase tracking-widest">
                   Prepared by {businessInfo.ownerInfo?.name || businessInfo.name || 'Founder'}
                 </p>
               </div>
            </div>
            
            <div className="mt-auto relative z-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-8 text-gray-400 text-sm break-words items-center">
               <div>
                  <p className="text-white font-bold">{businessInfo.email || 'contact@business.com'}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">Contact Email</p>
               </div>
               <div className="text-center">
                  <p className="text-white font-bold">{businessInfo.whatsapp || '+27 00 000 0000'}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">Direct Line</p>
               </div>
               <div className="text-right">
                  <p className="text-white font-bold truncate">{businessInfo.registration || 'Registration Number'}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">South Africa</p>
               </div>
            </div>

            {businessInfo.logoUrl && (
              <div className="absolute top-16 right-16 w-40 h-40 bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-6 flex items-center justify-center overflow-hidden shadow-2xl shrink-0 z-10 transition-transform">
                <img src={businessInfo.logoUrl} alt="Startup Logo" className="max-w-full max-h-full object-contain filter drop-shadow-md" />
              </div>
            )}
        </div>

        {/* Content Pages Template Component */}
        
        {/* Executive Summary */}
        <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
            <PageHeader />
            <h2 className="text-4xl font-bold text-[#2E1A47] mb-6 pb-4 border-b border-gray-100 shrink-0">Executive Summary</h2>
            <div className="w-full bg-[#FCF8F5] rounded-xl p-6 mb-6 border border-[#F2EAE5] shrink-0">
                <p className="text-lg text-[#785E93] font-medium leading-relaxed italic line-clamp-4">
                   "{businessInfo.description || data.executiveSummary?.substring(0, 150) + '...'}"
                </p>
            </div>
            <div className="text-gray-700 leading-relaxed space-y-4 text-sm text-justify relative flex-1">
                <div>
                  {data.executiveSummary?.split('\n').map((paragraph: string, i: number) => (
                     paragraph.trim() && <p key={i} className="mb-4">{paragraph}</p>
                  ))}
                </div>
            </div>
            <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
        </div>

        {/* SWOT Analysis */}
        {data.swot && (
          <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
              <PageHeader />
              <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">SWOT Analysis</h2>
              
              <div className="grid grid-cols-2 gap-6 flex-1">
                 <div className="bg-[#F8FBFE] p-6 rounded-2xl border border-[#E1EEFA] flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-black shrink-0">S</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Strengths</h3>
                    </div>
                    <ul className="space-y-3 flex-1 pb-4">
                      {data.swot.strengths?.map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-blue-400 mt-0.5 shrink-0">•</span> <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
                 
                 <div className="bg-[#FEF8F8] p-6 rounded-2xl border border-[#FAE1E1] flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center text-red-600 font-black shrink-0">W</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Weaknesses</h3>
                    </div>
                    <ul className="space-y-3 flex-1 pb-4">
                      {data.swot.weaknesses?.map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-red-400 mt-0.5 shrink-0">•</span> <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
                 
                 <div className="bg-[#F6FEF9] p-6 rounded-2xl border border-[#E1FBEB] flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 font-black shrink-0">O</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Opportunities</h3>
                    </div>
                    <ul className="space-y-3 flex-1 pb-4">
                      {data.swot.opportunities?.map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-emerald-400 mt-0.5 shrink-0">•</span> <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
                 
                 <div className="bg-[#FEFAF5] p-6 rounded-2xl border border-[#FBEAD4] flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                      <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center text-orange-600 font-black shrink-0">T</div>
                      <h3 className="text-xl font-bold text-[#2E1A47]">Threats</h3>
                    </div>
                    <ul className="space-y-3 flex-1 pb-4">
                      {data.swot.threats?.map((s: string, i: number) => (
                        <li key={i} className="text-gray-600 text-xs leading-relaxed flex items-start gap-2">
                           <span className="text-orange-400 mt-0.5 shrink-0">•</span> <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                 </div>
              </div>
              <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
          </div>
        )}

        {/* Market Research */}
        {data.marketResearch && (
           <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
             <PageHeader />
             <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Market Research</h2>
             
             <div className="grid grid-cols-3 gap-6 mb-8 shrink-0">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col justify-center">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Total Market</p>
                   <p className="text-xl font-bold text-[#2E1A47] break-words">{data.marketResearch.tam || 'ZAR 500M'}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col justify-center">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Serviceable Market</p>
                   <p className="text-xl font-bold text-[#2E1A47] break-words">{data.marketResearch.sam || 'ZAR 100M'}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center flex flex-col justify-center">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Obtainable Market</p>
                   <p className="text-xl font-bold text-[#2E1A47] break-words">{data.marketResearch.som || 'ZAR 10M'}</p>
                </div>
             </div>
             
             <h3 className="text-xl font-bold text-[#2E1A47] mb-4 shrink-0">Target Audience</h3>
             <div className="bg-[#F8F9FA] p-6 rounded-xl border border-gray-100 mb-6 shrink-0">
                 <ul className="space-y-3 text-gray-700">
                    {data.marketResearch.targetAudience?.map((t: string, i: number) => (
                       <li key={i} className="flex gap-4 items-start">
                           <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                           <span className="leading-relaxed text-sm">{t}</span>
                       </li>
                    ))}
                 </ul>
             </div>
             
             <h3 className="text-xl font-bold text-[#2E1A47] mb-4 shrink-0">Competitor Analysis</h3>
             <div className="text-gray-600 leading-relaxed text-sm text-justify relative flex-1">
                <div>
                  {data.marketResearch.competitorAnalysis?.split('\n').map((paragraph: string, i: number) => (
                     paragraph.trim() && <p key={i} className="mb-4">{paragraph}</p>
                  ))}
                </div>
             </div>
             
             <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
           </div>
        )}
        
        {/* Products & Services */}
        {data.productsServices && (
           <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
             <PageHeader />
             <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Products & Services</h2>
             <div className="space-y-6 flex-1">
               {data.productsServices?.map((item: any, i: number) => (
                 <div key={i} className="p-6 border border-gray-100 rounded-2xl bg-white shadow-sm flex items-start gap-6">
                    <div className="w-10 h-10 shrink-0 rounded-full border-2 border-indigo-100 flex items-center justify-center text-indigo-500 font-bold text-lg">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-[#2E1A47] mb-2">{item.name}</h3>
                        <p className="text-gray-600 leading-relaxed mb-4 text-xs">{item.description}</p>
                        
                        <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-indigo-50 rounded-lg max-w-full">
                           <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest shrink-0">Pricing Strategy</span>
                           <span className="font-bold text-indigo-900 text-sm truncate">{item.pricing}</span>
                        </div>
                    </div>
                 </div>
               ))}
             </div>
             <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
           </div>
        )}
        
        {/* Financial Plan */}
        {data.financialPlan && (
           <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
             <PageHeader />
             <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Financial Plan</h2>
             
             <div className="mb-10 flex gap-6 shrink-0 h-auto">
                <div className="w-1/2 bg-[#2E1A47] p-8 rounded-3xl text-white flex flex-col">
                   <p className="text-xs text-[#A592C4] font-bold uppercase tracking-widest mb-3 shrink-0">Funding Required</p>
                   <p className="text-3xl font-black mb-3 break-words shrink-0">{data.financialPlan.fundingRequirement}</p>
                   <div className="w-full h-[1px] bg-white/10 mb-4 shrink-0"></div>
                   <p className="text-[#D3C7E8] font-medium leading-relaxed text-sm">{data.financialPlan.fundingPurpose}</p>
                </div>
                <div className="w-1/2 p-6 border border-gray-100 rounded-3xl bg-[#F8F9FA] flex flex-col">
                   <h3 className="text-base font-bold text-[#2E1A47] mb-4 shrink-0">Use of Funds Allocation</h3>
                   <div className="space-y-3 flex-1 pr-2 custom-scrollbar">
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
             
             <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
           </div>
        )}

{/* Go-To-Market Strategy */}
{data.goToMarket && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-6 pb-4 border-b border-gray-100 shrink-0">Go-To-Market Strategy</h2>
    <div className="text-gray-700 leading-relaxed text-sm mb-8 shrink-0">
       {data.goToMarket.strategy?.split('\n').map((paragraph: string, i: number) => (
          paragraph.trim() && <p key={i} className="mb-4">{paragraph}</p>
       ))}
    </div>
    <div className="grid grid-cols-2 gap-6 mb-8 shrink-0">
      <div>
        <h3 className="text-base font-bold text-[#2E1A47] mb-3">Channels</h3>
        <ul className="space-y-2">
          {data.goToMarket.channels?.map((c: string, i: number) => (
            <li key={i} className="text-gray-600 text-xs flex items-start gap-2">
              <span className="text-indigo-400 shrink-0 mt-0.5">→</span> {c}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-base font-bold text-[#2E1A47] mb-3">12-Month Milestones</h3>
        <div className="space-y-2">
          {data.goToMarket.milestones?.map((m: any, i: number) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded shrink-0">{m.quarter}</span>
              <span className="text-gray-600 text-xs leading-relaxed">{m.goal}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
  </div>
)}

{/* Operations Plan */}
{data.operationsPlan && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-6 pb-4 border-b border-gray-100 shrink-0">Operations Plan</h2>
    <div className="text-gray-700 leading-relaxed text-sm mb-8 shrink-0">
       {data.operationsPlan.overview?.split('\n').map((paragraph: string, i: number) => (
          paragraph.trim() && <p key={i} className="mb-4">{paragraph}</p>
       ))}
    </div>
    <div className="grid grid-cols-2 gap-8 flex-1">
      <div>
        <h3 className="text-base font-bold text-[#2E1A47] mb-4">Key Activities</h3>
        <ul className="space-y-3">
          {data.operationsPlan.keyActivities?.map((a: string, i: number) => (
            <li key={i} className="text-gray-600 text-xs flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              {a}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-base font-bold text-[#2E1A47] mb-4">Technology & Tools</h3>
        <div className="flex flex-wrap gap-2">
          {data.operationsPlan.technologyStack?.map((t: string, i: number) => (
            <span key={i} className="px-3 py-1 bg-[#F3F0F8] text-[#2E1A47] text-xs font-bold rounded-lg">{t}</span>
          ))}
        </div>
        {data.operationsPlan.location && (
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Operating Location</p>
            <p className="text-sm font-bold text-[#2E1A47]">{data.operationsPlan.location}</p>
          </div>
        )}
      </div>
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
  </div>
)}

{/* Team */}
{data.team && data.team.length > 0 && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-6 pb-4 border-b border-gray-100 shrink-0">Management Team</h2>
    <div className="space-y-6 flex-1">
      {data.team?.map((member: any, i: number) => (
        <div key={i} className="p-6 border border-gray-100 rounded-2xl bg-white shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#2E1A47] flex items-center justify-center text-white font-black text-sm shrink-0">
              {member.role?.charAt(0)}
            </div>
            <h3 className="text-lg font-bold text-[#2E1A47]">{member.role}</h3>
          </div>
          <p className="text-gray-600 text-xs leading-relaxed mb-2">{member.responsibilities}</p>
          <p className="text-gray-400 text-xs italic">{member.background}</p>
        </div>
      ))}
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
  </div>
)}

{/* Risk Mitigation */}
{data.riskMitigation && data.riskMitigation.length > 0 && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-6 pb-4 border-b border-gray-100 shrink-0">Risk Analysis & Mitigation</h2>
    <div className="space-y-4 flex-1">
      {data.riskMitigation?.map((r: any, i: number) => (
        <div key={i} className="p-5 border border-gray-100 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Risk</p>
            <p className="text-sm font-bold text-gray-800">{r.risk}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Impact</p>
            <p className="text-xs text-gray-600">{r.impact}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Mitigation</p>
            <p className="text-xs text-gray-600">{r.mitigation}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4"></div>
  </div>
)}

{/* Conclusion */}
{data.conclusion && (
  <div className="w-full min-h-[297mm] p-16 bg-[#05050A] page-break flex flex-col">
    <div className="flex-1 flex flex-col justify-center relative z-10">
      <div className="w-24 h-1.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 mb-10 rounded-full"></div>
      <h2 className="text-4xl font-bold text-white mb-8">Conclusion & Call to Action</h2>
      <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
        {data.conclusion?.split('\n').map((p: string, i: number) => (
          p.trim() && <p key={i} className="text-gray-300 leading-relaxed mb-4 text-sm">{p}</p>
        ))}
      </div>
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-600 font-bold border-t border-white/10 pt-4">12</div>
  </div>
)}

      </div>
    </div>
  );
};

export default BusinessPlanDocument;


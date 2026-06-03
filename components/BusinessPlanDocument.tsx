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
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
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
        
        {/* Table of Contents */}
        <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
          <PageHeader />
          <h2 className="text-4xl font-bold text-[#2E1A47] mb-12 pb-4 border-b border-gray-100 shrink-0">Table of Contents</h2>
          <div className="flex-1 space-y-0">
            {[
              { num: '01', title: 'Executive Summary', sub: 'Business overview and funding ask' },
              { num: '02', title: 'Vision & Mission', sub: 'Purpose, values and direction' },
              { num: '03', title: 'The Problem & Solution', sub: 'Market gap and our answer' },
              { num: '04', title: 'Viability Assessment', sub: 'Scoring across 5 dimensions' },
              { num: '05', title: 'Market Size & Opportunity', sub: 'TAM, SAM, SOM analysis' },
              { num: '06', title: 'Competitive Positioning', sub: 'Competitor landscape and differentiation' },
              { num: '07', title: 'Products & Services', sub: 'Offerings, pricing and differentiators' },
              { num: '08', title: 'Business Models', sub: 'Revenue model variations' },
              { num: '09', title: 'Go-To-Market Strategy', sub: 'Channels, milestones and execution' },
              { num: '10', title: 'Social Media & Digital Marketing', sub: 'Platform strategy and content mix' },
              { num: '11', title: 'SEO & Content Strategy', sub: 'Keywords and digital presence' },
              { num: '12', title: 'Operations Plan', sub: 'Activities, technology and location' },
              { num: '13', title: 'Management Team', sub: 'Founders and key roles' },
              { num: '14', title: 'Branding & Identity', sub: 'Visual identity and brand voice' },
              { num: '15', title: 'Financial Plan', sub: 'Funding requirement and projections' },
              { num: '16', title: 'Financial Statements', sub: 'P&L, Balance Sheet, Cash Flow' },
              { num: '17', title: 'SWOT Analysis', sub: 'Strengths, Weaknesses, Opportunities, Threats' },
              { num: '18', title: 'Risk Analysis & Mitigation', sub: 'Key risks and responses' },
              { num: '19', title: 'SA Compliance & Regulatory', sub: 'Legal and regulatory readiness' },
              { num: '20', title: 'Implementation Plan', sub: 'Pre-launch and post-launch roadmap' },
              { num: '21', title: '5-Year Strategic Plan', sub: 'Long-term vision by year' },
              { num: '22', title: 'Conclusion', sub: 'Call to action for funders' },
            ].map((item) => (
              <div key={item.num} className="flex items-center gap-4 py-3 border-b border-gray-50 group hover:bg-[#F9F7FF] px-2 rounded-lg transition-colors">
                <span className="text-xs font-black text-[#2E1A47]/30 w-8 shrink-0">{item.num}</span>
                <div className="flex-1">
                  <span className="text-sm font-bold text-[#2E1A47]">{item.title}</span>
                  <span className="text-xs text-gray-400 ml-2">{item.sub}</span>
                </div>
                <div className="flex-1 border-b border-dashed border-gray-200 mx-2"></div>
              </div>
            ))}
          </div>
          <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">2</div>
        </div>

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

{/* Social Media & Digital Marketing */}
{data.socialMediaStrategy && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Social Media & Digital Marketing</h2>
    {data.socialMediaStrategy.overview && (
      <div className="text-sm text-gray-700 leading-relaxed space-y-3 mb-8">
        {data.socialMediaStrategy.overview.split('\n').map((p: string, i: number) =>
          p.trim() && <p key={i}>{p}</p>
        )}
      </div>
    )}
    {data.socialMediaStrategy.platforms && (
      <div className="mb-8">
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-4">Platform Strategy</h3>
        <div className="space-y-3">
          {data.socialMediaStrategy.platforms.map((platform: any, i: number) => (
            <div key={i} className="bg-[#F9F7FF] rounded-2xl p-5 flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-[#2E1A47] text-white flex items-center justify-center text-xs font-black shrink-0">
                {platform.name?.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-sm font-black text-[#2E1A47]">{platform.name}</h4>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">{platform.postFrequency}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{platform.audience}</p>
                <div className="flex flex-wrap gap-1">
                  {platform.contentTypes?.map((type: string, j: number) => (
                    <span key={j} className="text-[10px] bg-white text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{type}</span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-gray-400">Goal</span>
                <p className="text-xs font-bold text-[#2E1A47]">{platform.primaryGoal}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
    {data.socialMediaStrategy.contentMix && (
      <div>
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-4">Content Mix</h3>
        <div className="grid grid-cols-2 gap-3">
          {data.socialMediaStrategy.contentMix.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                {item.percentage}%
              </div>
              <div>
                <p className="text-xs font-bold text-[#2E1A47]">{item.category}</p>
                <p className="text-[10px] text-gray-400">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

{/* SEO & Content Strategy */}
{data.seoStrategy && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">SEO & Content Strategy</h2>
    {data.seoStrategy.overview && (
      <div className="text-sm text-gray-700 leading-relaxed space-y-3 mb-8">
        {data.seoStrategy.overview.split('\n').map((p: string, i: number) =>
          p.trim() && <p key={i}>{p}</p>
        )}
      </div>
    )}
    {data.seoStrategy.keywords && (
      <div>
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-4">Target Keywords</h3>
        <div className="rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#2E1A47] text-white">
                <th className="p-3 text-left font-bold">Keyword</th>
                <th className="p-3 text-left font-bold">Intent</th>
                <th className="p-3 text-left font-bold">Difficulty</th>
                <th className="p-3 text-left font-bold">Priority</th>
              </tr>
            </thead>
            <tbody>
              {data.seoStrategy.keywords.map((kw: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9F7FF]'}>
                  <td className="p-3 font-bold text-[#2E1A47]">{kw.term}</td>
                  <td className="p-3 text-gray-600">{kw.intent}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      kw.difficulty === 'Low' ? 'bg-green-100 text-green-700' :
                      kw.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{kw.difficulty}</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      kw.priority === 'Primary' ? 'bg-indigo-100 text-indigo-700' :
                      kw.priority === 'Secondary' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{kw.priority}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
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

{/* Branding & Identity */}
{data.brandingIdentity && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Branding & Identity</h2>
    <div className="grid grid-cols-2 gap-8 mb-8">
      <div>
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-4">Colour Palette</h3>
        <div className="flex gap-3">
          {[
            { label: 'Primary', hex: data.brandingIdentity.primaryColor || '#2E1A47' },
            { label: 'Secondary', hex: data.brandingIdentity.secondaryColor || '#6C3FC5' },
            { label: 'Accent', hex: data.brandingIdentity.accentColor || '#00D4FF' },
          ].map((swatch) => (
            <div key={swatch.label} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl shadow-md border border-gray-100" style={{ backgroundColor: swatch.hex }}></div>
              <span className="text-[10px] font-bold text-gray-500">{swatch.label}</span>
              <span className="text-[9px] text-gray-400 font-mono">{swatch.hex}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-4">Typography</h3>
        <div className="space-y-3">
          <div className="bg-[#F9F7FF] rounded-xl p-4">
            <p className="text-[10px] text-gray-500 mb-1">Primary / Headlines</p>
            <p className="text-lg font-black text-[#2E1A47]">{data.brandingIdentity.primaryFont || 'Inter'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 mb-1">Body Copy</p>
            <p className="text-sm text-gray-700">{data.brandingIdentity.bodyFont || 'Inter'}</p>
          </div>
        </div>
      </div>
    </div>
    {data.brandingIdentity.tagline && (
      <div className="bg-gradient-to-r from-[#2E1A47] to-indigo-700 rounded-2xl p-8 mb-8 text-center">
        <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-3">Brand Tagline</p>
        <p className="text-2xl font-black text-white italic">"{data.brandingIdentity.tagline}"</p>
      </div>
    )}
    {data.brandingIdentity.brandVoice && (
      <div className="mb-6">
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-3">Brand Voice & Tone</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{data.brandingIdentity.brandVoice}</p>
      </div>
    )}
    {data.brandingIdentity.brandPersonality && (
      <div>
        <h3 className="text-xs font-black text-[#2E1A47] uppercase tracking-widest mb-3">Brand Personality</h3>
        <div className="flex flex-wrap gap-2">
          {data.brandingIdentity.brandPersonality.map((trait: string, i: number) => (
            <span key={i} className="px-4 py-2 bg-[#F3F0F8] text-[#2E1A47] text-xs font-bold rounded-full">{trait}</span>
          ))}
        </div>
      </div>
    )}
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

{/* Vision & Mission */}
{data.visionMission && (
  <div className="w-full min-h-[297mm] p-16 bg-[#05050A] page-break flex flex-col">
    <div className="flex-1 flex flex-col justify-center relative z-10">
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-900/20 rounded-full blur-[100px]"></div>
      </div>
      <div className="w-16 h-1 bg-gradient-to-r from-purple-500 to-cyan-400 mb-8 rounded-full relative z-10"></div>
      <div className="grid grid-cols-2 gap-8 relative z-10">
        <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
          <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">Vision</p>
          <p className="text-2xl font-bold text-white leading-relaxed">{data.visionMission.vision}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
          <p className="text-xs font-black text-purple-400 uppercase tracking-widest mb-4">Mission</p>
          <p className="text-2xl font-bold text-white leading-relaxed">{data.visionMission.mission}</p>
        </div>
      </div>
      {data.valueProposition && (
        <div className="mt-8 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 p-8 rounded-2xl relative z-10">
          <p className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-3">Value Proposition</p>
          <p className="text-xl text-gray-200 leading-relaxed italic">"{data.valueProposition}"</p>
        </div>
      )}
    </div>
    <div className="shrink-0 text-right text-sm text-gray-600 font-bold border-t border-white/10 pt-4 relative z-10">3</div>
  </div>
)}

{/* Problem & Solution */}
{(data.problemStatement || data.solutionOverview) && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    {data.problemStatement && (
      <>
        <h2 className="text-4xl font-bold text-[#2E1A47] mb-3 pb-4 border-b border-gray-100 shrink-0">The Problem</h2>
        <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-r-2xl mb-8 shrink-0">
          <div className="text-gray-700 text-sm leading-relaxed space-y-3">
            {data.problemStatement?.split('\n').map((p: string, i: number) =>
              p.trim() && <p key={i}>{p}</p>
            )}
          </div>
        </div>
      </>
    )}
    {data.solutionOverview && (
      <>
        <h2 className="text-4xl font-bold text-[#2E1A47] mb-3 pb-4 border-b border-gray-100 shrink-0">The Solution</h2>
        <div className="bg-emerald-50 border-l-4 border-emerald-400 p-6 rounded-r-2xl flex-1">
          <div className="text-gray-700 text-sm leading-relaxed space-y-3">
            {data.solutionOverview?.split('\n').map((p: string, i: number) =>
              p.trim() && <p key={i}>{p}</p>
            )}
          </div>
        </div>
      </>
    )}
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">4</div>
  </div>
)}

{/* Viability Score */}
{data.viabilityScore && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Viability Assessment</h2>
    <div className="flex items-center justify-center mb-10 shrink-0">
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#f3f0f8" strokeWidth="16"/>
          <circle
            cx="100" cy="100" r="80" fill="none"
            stroke="url(#scoreGrad)" strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(data.viabilityScore.overall / 100) * 502} 502`}
          />
          <defs>
            <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1"/>
              <stop offset="100%" stopColor="#a855f7"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black text-[#2E1A47]">{data.viabilityScore.overall}</span>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">/ 100</span>
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-8 shrink-0">
      {[
        { label: 'Market Opportunity', key: 'marketOpportunity', color: 'bg-blue-500' },
        { label: 'Team Strength', key: 'teamStrength', color: 'bg-purple-500' },
        { label: 'Financial Viability', key: 'financialViability', color: 'bg-emerald-500' },
        { label: 'Social Impact', key: 'socialImpact', color: 'bg-orange-500' },
        { label: 'Competitive Position', key: 'competitivePosition', color: 'bg-cyan-500' },
      ].map((item) => (
        <div key={item.key} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-gray-500">{item.label}</span>
            <span className="text-sm font-black text-[#2E1A47]">{data.viabilityScore[item.key]}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`${item.color} h-2 rounded-full transition-all`}
              style={{ width: `${data.viabilityScore[item.key]}%` }}
            />
          </div>
        </div>
      ))}
    </div>
    {data.viabilityScore.reasoning && (
      <div className="bg-[#F8F5FF] border border-[#E8DEFF] p-6 rounded-2xl flex-1">
        <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-3">Assessment Reasoning</p>
        <p className="text-gray-700 text-sm leading-relaxed">{data.viabilityScore.reasoning}</p>
      </div>
    )}
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">5</div>
  </div>
)}

{/* TAM SAM SOM Visual Page */}
{data.marketResearch && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Market Size & Opportunity</h2>
    <div className="flex items-center justify-center gap-8 mb-10 shrink-0">
      <div className="relative flex items-center justify-center" style={{width: 280, height: 280}}>
        <svg width="280" height="280" viewBox="0 0 280 280">
          <circle cx="140" cy="140" r="130" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2"/>
          <circle cx="140" cy="140" r="90" fill="#DDD6FE" stroke="#A78BFA" strokeWidth="2"/>
          <circle cx="140" cy="140" r="52" fill="#2E1A47" stroke="#6D28D9" strokeWidth="2"/>
          <text x="140" y="135" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">SOM</text>
          <text x="140" y="152" textAnchor="middle" fill="#C4B5FD" fontSize="9">Obtainable</text>
        </svg>
        <div className="absolute top-2 right-2 text-right">
          <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">TAM</p>
          <p className="text-xs font-bold text-[#2E1A47]">{data.marketResearch.tam?.split(' ').slice(0,2).join(' ')}</p>
        </div>
        <div className="absolute left-0 top-1/3">
          <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">SAM</p>
          <p className="text-xs font-bold text-[#2E1A47]">{data.marketResearch.sam?.split(' ').slice(0,2).join(' ')}</p>
        </div>
      </div>
      <div className="flex-1 space-y-6">
        {[
          { label: 'TAM', sub: 'Total Addressable Market', value: data.marketResearch.tam, color: 'bg-indigo-100 text-indigo-700' },
          { label: 'SAM', sub: 'Serviceable Available Market', value: data.marketResearch.sam, color: 'bg-purple-100 text-purple-700' },
          { label: 'SOM', sub: 'Serviceable Obtainable Market', value: data.marketResearch.som, color: 'bg-[#2E1A47] text-white' },
        ].map((m) => (
          <div key={m.label} className="flex gap-4 items-start">
            <span className={`px-3 py-1 rounded-lg text-xs font-black shrink-0 ${m.color}`}>{m.label}</span>
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">{m.sub}</p>
              <p className="text-sm text-gray-700 leading-relaxed">{m.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    {data.marketResearch.industryAnalysis && (
      <div className="flex-1">
        <h3 className="text-base font-bold text-[#2E1A47] mb-3">Industry Analysis</h3>
        <div className="text-gray-600 text-sm leading-relaxed space-y-3">
          {data.marketResearch.industryAnalysis?.split('\n').map((p: string, i: number) =>
            p.trim() && <p key={i}>{p}</p>
          )}
        </div>
      </div>
    )}
    {data.marketResearch.marketTrends && (
      <div className="mt-6 shrink-0">
        <h3 className="text-base font-bold text-[#2E1A47] mb-3">Market Trends</h3>
        <div className="grid grid-cols-2 gap-3">
          {data.marketResearch.marketTrends?.map((t: string, i: number) => (
            <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-600">
              <span className="text-indigo-400 shrink-0 font-black mt-0.5">↑</span>{t}
            </div>
          ))}
        </div>
      </div>
    )}
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">9</div>
  </div>
)}

{/* Competitive Positioning */}
{data.competitorPositioning && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Competitive Positioning</h2>
    {data.competitorPositioning.summary && (
      <div className="text-sm text-gray-700 leading-relaxed space-y-3 mb-8">
        {data.competitorPositioning.summary.split('\n').map((p: string, i: number) =>
          p.trim() && <p key={i}>{p}</p>
        )}
      </div>
    )}
    {data.competitorPositioning.competitors && data.competitorPositioning.competitors.length > 0 && (
      <div className="flex-1">
        <h3 className="text-base font-bold text-[#2E1A47] mb-4">Competitor Comparison Matrix</h3>
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#2E1A47] text-white">
                <th className="p-3 text-left font-bold">Competitor</th>
                <th className="p-3 text-center font-bold">Quality</th>
                <th className="p-3 text-center font-bold">Pricing</th>
                <th className="p-3 text-center font-bold">Innovation</th>
                <th className="p-3 text-center font-bold">Service</th>
                <th className="p-3 text-center font-bold">Market Presence</th>
                <th className="p-3 text-left font-bold">Key Weakness</th>
              </tr>
            </thead>
            <tbody>
              {data.competitorPositioning.competitors.map((c: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9F7FF]'}>
                  <td className="p-3 font-bold text-[#2E1A47]">{c.name}</td>
                  {(['productQuality', 'pricing', 'innovation', 'customerService', 'marketPresence'] as const).map((dim) => (
                    <td key={dim} className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-8 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-[#2E1A47] rounded-full" style={{ width: `${(c[dim] || 5) * 10}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500">{c[dim] || '–'}</span>
                      </div>
                    </td>
                  ))}
                  <td className="p-3 text-gray-500 text-[10px]">{c.keyWeakness}</td>
                </tr>
              ))}
              <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black">
                <td className="p-3">✦ {businessInfo.name}</td>
                <td className="p-3 text-center text-xs">9</td>
                <td className="p-3 text-center text-xs">7</td>
                <td className="p-3 text-center text-xs">10</td>
                <td className="p-3 text-center text-xs">9</td>
                <td className="p-3 text-center text-xs">8</td>
                <td className="p-3 text-xs">Challenger — rapid growth trajectory</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
)}

{/* Business Models */}
{data.businessModels && data.businessModels.length > 0 && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Business Models</h2>
    <div className="grid grid-cols-2 gap-6 flex-1">
      {data.businessModels?.map((model: any, i: number) => (
        <div key={i} className="p-6 border border-gray-100 rounded-2xl bg-white shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm shrink-0">
              {i + 1}
            </div>
            <h3 className="text-base font-bold text-[#2E1A47]">{model.name}</h3>
          </div>
          <p className="text-gray-600 text-xs leading-relaxed mb-4 flex-1">{model.description}</p>
          <div className="grid grid-cols-2 gap-3 mt-auto">
            <div>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Advantages</p>
              <ul className="space-y-1">
                {model.advantages?.slice(0,3).map((a: string, j: number) => (
                  <li key={j} className="text-[10px] text-gray-500 flex items-start gap-1">
                    <span className="text-emerald-400 shrink-0">+</span>{a}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Challenges</p>
              <ul className="space-y-1">
                {model.challenges?.slice(0,3).map((c: string, j: number) => (
                  <li key={j} className="text-[10px] text-gray-500 flex items-start gap-1">
                    <span className="text-red-400 shrink-0">−</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">11</div>
  </div>
)}

{/* Financial Statements */}
{data.financialStatements && (
  <>
    {/* P&L */}
    <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
      <PageHeader />
      <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Profit & Loss Statement</h2>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[#2E1A47]">
              <th className="text-left py-3 font-black text-[#2E1A47] text-xs uppercase tracking-widest">Line Item</th>
              {['Year 1','Year 2','Year 3','Year 4','Year 5'].map(y => (
                <th key={y} className="text-right py-3 font-black text-[#2E1A47] text-xs uppercase tracking-widest px-2">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.financialStatements.profitLoss?.map((row: any, i: number) => (
              <tr key={i} className={`border-b border-gray-50 ${row.isTotal ? 'bg-[#F8F5FF] font-bold' : ''}`}>
                <td className="py-3 text-gray-700 font-medium">{row.label}</td>
                {row.values?.map((v: string, j: number) => (
                  <td key={j} className={`py-3 text-right px-2 font-mono ${row.isTotal ? 'font-black text-[#2E1A47]' : 'text-gray-600'} ${v?.startsWith('(') ? 'text-red-500' : ''}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">28</div>
    </div>

    {/* Balance Sheet */}
    <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
      <PageHeader />
      <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Balance Sheet</h2>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[#2E1A47]">
              <th className="text-left py-3 font-black text-[#2E1A47] text-xs uppercase tracking-widest">Item</th>
              {['Year 1','Year 2','Year 3','Year 4','Year 5'].map(y => (
                <th key={y} className="text-right py-3 font-black text-[#2E1A47] text-xs uppercase tracking-widest px-2">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.financialStatements.balanceSheet?.map((row: any, i: number) => (
              <tr key={i} className={`border-b border-gray-50 ${row.isTotal ? 'bg-[#F8F5FF] font-bold' : ''} ${row.isHeader ? 'bg-gray-100' : ''}`}>
                <td className={`py-3 text-gray-700 ${row.isHeader ? 'font-black text-[#2E1A47] uppercase text-[10px] tracking-widest' : 'font-medium pl-4'}`}>{row.label}</td>
                {row.isHeader ? <td colSpan={5}></td> : row.values?.map((v: string, j: number) => (
                  <td key={j} className={`py-3 text-right px-2 font-mono ${row.isTotal ? 'font-black text-[#2E1A47]' : 'text-gray-600'}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">29</div>
    </div>

    {/* Cash Flow */}
    <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
      <PageHeader />
      <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Cash Flow Statement</h2>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[#2E1A47]">
              <th className="text-left py-3 font-black text-[#2E1A47] text-xs uppercase tracking-widest">Activity</th>
              {['Year 1','Year 2','Year 3','Year 4','Year 5'].map(y => (
                <th key={y} className="text-right py-3 font-black text-[#2E1A47] text-xs uppercase tracking-widest px-2">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.financialStatements.cashFlow?.map((row: any, i: number) => (
              <tr key={i} className={`border-b border-gray-50 ${row.isTotal ? 'bg-[#F8F5FF] font-bold' : ''}`}>
                <td className="py-3 text-gray-700 font-medium">{row.label}</td>
                {row.values?.map((v: string, j: number) => (
                  <td key={j} className={`py-3 text-right px-2 font-mono ${row.isTotal ? 'font-black text-[#2E1A47]' : 'text-gray-600'} ${v?.startsWith('(') ? 'text-red-500' : ''}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">30</div>
    </div>
  </>
)}

{/* SA Compliance & Regulatory */}
{data.saCompliance && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">SA Compliance & Regulatory</h2>
    {data.saCompliance.overview && (
      <div className="text-sm text-gray-700 leading-relaxed space-y-3 mb-8">
        {data.saCompliance.overview.split('\n').map((p: string, i: number) =>
          p.trim() && <p key={i}>{p}</p>
        )}
      </div>
    )}
    {data.saCompliance.requirements && (
      <div className="grid grid-cols-2 gap-4">
        {data.saCompliance.requirements.map((req: any, i: number) => (
          <div key={i} className="bg-[#F9F7FF] rounded-2xl p-5 border border-[#E8E0F5]">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#2E1A47] flex items-center justify-center text-white text-[10px] font-black shrink-0">
                {req.body?.substring(0, 4)}
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                req.status === 'Required' ? 'bg-red-100 text-red-700' :
                req.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'
              }`}>{req.status}</span>
            </div>
            <h4 className="text-sm font-black text-[#2E1A47] mb-1">{req.body}</h4>
            <p className="text-xs text-gray-600 mb-2">{req.requirement}</p>
            {req.notes && <p className="text-[10px] text-gray-400 italic">{req.notes}</p>}
          </div>
        ))}
      </div>
    )}
  </div>
)}

{/* Pre & Post Launch */}
{data.implementationPlan && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">Implementation Plan</h2>
    <div className="grid grid-cols-2 gap-8 flex-1">
      {data.implementationPlan.preLaunch && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-orange-400 shrink-0"></div>
            <h3 className="text-base font-bold text-[#2E1A47]">Pre-Launch</h3>
          </div>
          <div className="space-y-4">
            {data.implementationPlan.preLaunch?.map((section: any, i: number) => (
              <div key={i}>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{section.category}</p>
                <ul className="space-y-1.5">
                  {section.tasks?.map((t: string, j: number) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="w-4 h-4 rounded border border-gray-300 shrink-0 mt-0.5 flex items-center justify-center text-[8px] text-gray-400">✓</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.implementationPlan.postLaunch && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shrink-0"></div>
            <h3 className="text-base font-bold text-[#2E1A47]">Post-Launch</h3>
          </div>
          <div className="space-y-4">
            {data.implementationPlan.postLaunch?.map((section: any, i: number) => (
              <div key={i}>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{section.category}</p>
                <ul className="space-y-1.5">
                  {section.tasks?.map((t: string, j: number) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="w-4 h-4 rounded border border-gray-300 shrink-0 mt-0.5 flex items-center justify-center text-[8px] text-gray-400">✓</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">44</div>
  </div>
)}

{/* 5-Year Plan */}
{data.implementationPlan?.fiveYearPlan && (
  <div className="w-full min-h-[297mm] p-16 bg-white page-break flex flex-col">
    <PageHeader />
    <h2 className="text-4xl font-bold text-[#2E1A47] mb-8 pb-4 border-b border-gray-100 shrink-0">5-Year Strategic Plan</h2>
    <div className="space-y-6 flex-1">
      {data.implementationPlan.fiveYearPlan?.map((year: any, i: number) => (
        <div key={i} className="flex gap-6 items-start">
          <div className="w-20 shrink-0 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm mx-auto mb-1">
              Y{i + 1}
            </div>
            <p className="text-[10px] font-bold text-gray-400">{year.year || `Year ${i + 1}`}</p>
          </div>
          <div className="flex-1 border-l-2 border-indigo-100 pl-6">
            <h3 className="text-base font-bold text-[#2E1A47] mb-3">{year.title}</h3>
            <ul className="space-y-2">
              {year.initiatives?.map((init: string, j: number) => (
                <li key={j} className="text-xs text-gray-600 flex items-start gap-2">
                  <span className="text-indigo-400 shrink-0 mt-0.5">→</span>{init}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-auto shrink-0 text-right text-sm text-gray-400 font-bold border-t border-gray-100 pt-4">45</div>
  </div>
)}

      </div>
    </div>
  );
};

export default BusinessPlanDocument;


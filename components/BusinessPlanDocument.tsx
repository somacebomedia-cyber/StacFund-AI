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
          scale: 1.5, // 1.5 instead of 2.0 prevents mobile memory crashes (iOS 15MB canvas limit)
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
    <div style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 16, padding: '16px', position: 'relative', zIndex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
        <thead>
          <tr style={{ background: 'rgba(109, 40, 217, 0.85)' }}>
            {columns.map((col: string, i: number) => (
              <th key={i} style={{ color: 'white', fontWeight: 800, padding: '12px 16px', textAlign: columnAlignments && columnAlignments[i] ? columnAlignments[i] : 'left', fontSize: 13, letterSpacing: '0.05em' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item: any, i: number) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.80)', borderBottom: '1px solid rgba(109,40,217,0.20)' }}>
              {item.map((val: any, j: number) => (
                <td key={j} style={{ color: '#1e1b4b', padding: '10px 16px', fontSize: 13, fontWeight: 500, textAlign: columnAlignments && columnAlignments[j] ? columnAlignments[j] : 'left' }}>
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
            <div className="space-y-4">
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
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-[#A3E635] w-6">{item.num}.</span>
                      <span className="font-medium text-lg">{item.title}</span>
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
            <div className="relative z-10 flex-1 text-white/90 leading-relaxed space-y-4 text-justify">
               {data.executiveSummary?.split('\n').map((paragraph: string, i: number) => (
                   paragraph.trim() && <p key={i}>{paragraph}</p>
               ))}
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
                  <div className="text-white/90 leading-relaxed space-y-3">
                    {data.problemStatement?.split('\n').map((p: string, i: number) =>
                      p.trim() && <p key={i}>{p}</p>
                    )}
                  </div>
                </Card>
              )}
              {data.solutionOverview && (
                <Card style={{ borderLeft: '4px solid #A3E635' }}>
                  <h3 className="text-xl font-bold text-[#A3E635] mb-4">The Solution</h3>
                  <div className="text-white/90 leading-relaxed space-y-3">
                    {data.solutionOverview?.split('\n').map((p: string, i: number) =>
                      p.trim() && <p key={i}>{p}</p>
                    )}
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
                  <div className="flex flex-col items-center justify-center relative z-10">
                    <span className="text-5xl font-black text-white">{data.viabilityScore.overall}</span>
                    <span className="text-xs font-bold text-white/50 uppercase tracking-widest">/ 100</span>
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
                    <div className="text-white/80 text-sm leading-relaxed space-y-3">
                      {data.marketResearch.industryAnalysis?.split('\n').map((p: string, i: number) =>
                        p.trim() && <p key={i}>{p}</p>
                      )}
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
                  <div className="text-white/90 leading-relaxed text-sm space-y-3">
                    {data.competitorPositioning.summary.split('\n').map((p: string, i: number) =>
                      p.trim() && <p key={i}>{p}</p>
                    )}
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
                 {data.goToMarket.strategy?.split('\n').map((paragraph: string, i: number) => (
                    paragraph.trim() && <p key={i} className="mb-4 text-white/90 text-sm">{paragraph}</p>
                 ))}
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
                  <div className="text-sm text-white/90 leading-relaxed space-y-3">
                    {data.socialMediaStrategy.overview.split('\n').map((p: string, i: number) =>
                      p.trim() && <p key={i}>{p}</p>
                    )}
                  </div>
                </Card>
              )}
              {data.socialMediaStrategy.platforms && (
                <div>
                  <h3 className="text-sm font-black text-[#A3E635] uppercase tracking-widest mb-4">Platform Strategy</h3>
                  <div className="space-y-4">
                    {data.socialMediaStrategy.platforms.map((platform: any, i: number) => (
                      <Card key={i} className="flex gap-4 items-start">
                        <div className="w-12 h-12 rounded-xl bg-[rgba(255,255,255,0.2)] text-white flex items-center justify-center text-sm font-black shrink-0">
                          {platform.name?.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-lg font-black text-white">{platform.name}</h4>
                            <span className="text-[10px] bg-[rgba(163,230,53,0.2)] text-[#A3E635] font-bold px-2 py-0.5 rounded-full">{platform.postFrequency}</span>
                          </div>
                          <p className="text-sm text-white/70 mb-3">{platform.audience}</p>
                          <div className="flex flex-wrap gap-2">
                            {platform.contentTypes?.map((type: string, j: number) => (
                              <span key={j} className="text-xs bg-white text-[#1e1b4b] px-2 py-1 rounded-full font-bold">{type}</span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs text-white/50">Goal</span>
                          <p className="text-sm font-bold text-[#A3E635]">{platform.primaryGoal}</p>
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
                  <div className="text-sm text-white/90 leading-relaxed space-y-3">
                    {data.seoStrategy.overview.split('\n').map((p: string, i: number) =>
                      p.trim() && <p key={i}>{p}</p>
                    )}
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
                  <div className="text-white/90 leading-relaxed text-sm space-y-3">
                     {data.operationsPlan.overview?.split('\n').map((paragraph: string, i: number) => (
                        paragraph.trim() && <p key={i}>{paragraph}</p>
                     ))}
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
                     <p className="text-4xl font-black text-white mb-4 break-words shrink-0">{data.financialPlan.fundingRequirement}</p>
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
                columns={['Line Item', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']}
                data={data.financialStatements.profitLoss.map((row: any) => [
                  row.label,
                  ...(row.values || [])
                ])}
                columnAlignments={['left','right','right','right','right','right']}
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
                columns={['Item', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']}
                data={data.financialStatements.balanceSheet.map((row: any) => [
                  row.label,
                  ...(row.isHeader ? ['','','','',''] : (row.values || []))
                ])}
                columnAlignments={['left','right','right','right','right','right']}
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
                columns={['Activity', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']}
                data={data.financialStatements.cashFlow.map((row: any) => [
                  row.label,
                  ...(row.values || [])
                ])}
                columnAlignments={['left','right','right','right','right','right']}
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
                  <div className="text-white/90 leading-relaxed text-sm space-y-3 text-justify">
                    {data.marketResearch.competitorAnalysis?.split('\n').map((paragraph: string, i: number) => (
                       paragraph.trim() && <p key={i}>{paragraph}</p>
                    ))}
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
                  <div className="text-sm text-white/90 leading-relaxed space-y-3">
                    {data.saCompliance.overview.split('\n').map((p: string, i: number) =>
                      p.trim() && <p key={i}>{p}</p>
                    )}
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
                {data.conclusion?.split('\n').map((p: string, i: number) => (
                  p.trim() && <p key={i} className="text-white/90 leading-relaxed mb-4 text-lg">{p}</p>
                ))}
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

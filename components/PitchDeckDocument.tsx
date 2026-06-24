import React, { useRef, useState } from 'react';
import { Download, X, Loader2 } from 'lucide-react';

interface PitchDeckDocumentProps {
  data: any;
  businessInfo: any;
  title?: string;
  onClose: () => void;
}

const PitchDeckDocument: React.FC<PitchDeckDocumentProps> = ({ data, businessInfo, title = 'Pitch Deck', onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('portrait');
  const isCancelledRef = useRef(false);

  // Landscape: 16:9, rendered at 1280x720
  // Portrait: A4, rendered at 800x1131
  const SLIDE_WIDTH_PX = orientation === 'landscape' ? 1280 : 800;
  const SLIDE_HEIGHT_PX = orientation === 'landscape' ? 720 : 1131;
  const PDF_WIDTH_MM = orientation === 'landscape' ? 297 : 210;
  const PDF_HEIGHT_MM = orientation === 'landscape' ? 167 : 297;
  const isPortrait = orientation === 'portrait';

  const handleCancelExport = () => {
    isCancelledRef.current = true;
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    setIsExporting(true);
    setExportProgress(null);
    isCancelledRef.current = false;

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const html2canvasLib = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const initialSlides = printRef.current.querySelectorAll<HTMLElement>('.deck-slide');
      if (!initialSlides.length) {
        console.error('No .deck-slide elements found');
        return;
      }
      const totalSlides = initialSlides.length;
      setExportProgress({ current: 0, total: totalSlides });

      const pdf = new jsPDF({ unit: 'mm', format: [PDF_WIDTH_MM, PDF_HEIGHT_MM], orientation });

      for (let i = 0; i < totalSlides; i++) {
        if (isCancelledRef.current) {
          throw new Error('Export cancelled by user');
        }
        setExportProgress({ current: i + 1, total: totalSlides });
        
        // Wait for React state to flush and re-render DOM
        await new Promise((resolve) => setTimeout(resolve, 150));
        
        const currentSlides = printRef.current?.querySelectorAll<HTMLElement>('.deck-slide');
        if (!currentSlides || !currentSlides[i]) continue;

        // Slides are fixed-aspect by design (16:9), so unlike the business plan
        // there's no variable-height content to measure — this is the one case
        // where a fixed capture height is actually correct, not a bug.
        const canvas = await html2canvasLib(currentSlides[i], {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#3B0764',
          logging: false,
          width: SLIDE_WIDTH_PX,
          height: SLIDE_HEIGHT_PX,
          windowWidth: SLIDE_WIDTH_PX,
          windowHeight: SLIDE_HEIGHT_PX,
          onclone: (clonedDoc: Document) => {
            const clonedSlides = clonedDoc.querySelectorAll('.deck-slide');
            clonedSlides.forEach((p: Element) => {
              (p as HTMLElement).style.width = `${SLIDE_WIDTH_PX}px`;
              (p as HTMLElement).style.minHeight = `${SLIDE_HEIGHT_PX}px`;
              (p as HTMLElement).style.height = `${SLIDE_HEIGHT_PX}px`;
            });
          },
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92); // higher quality — fewer slides, worth the size
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, PDF_WIDTH_MM, PDF_HEIGHT_MM);

        canvas.width = 0;
        canvas.height = 0;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const filename = `${businessInfo?.name?.replace(/\\s+/g, '_') || 'Business'}_Pitch_Deck.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Pitch deck export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const SlideStyle = {
    background: 'linear-gradient(135deg, #3B0764 0%, #6D28D9 50%, #9333EA 100%)',
  };

  const Blob = () => (
    <div
      className="absolute pointer-events-none"
      style={{
        top: '10%', left: '-10%', width: '55%', height: '70%',
        background: 'rgba(255,255,255,0.07)',
        borderRadius: '60% 40% 70% 30% / 50% 60% 40% 50%',
        zIndex: 0,
      }}
    />
  );

  const LogoHeader = () => (
    <div className="flex items-center gap-3 relative z-10" style={{ marginBottom: 16 }}>
      {businessInfo.logoUrl ? (
        <div style={{ width: 44, height: 44, background: 'white', borderRadius: 12, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', flexShrink: 0 }}>
          <img src={businessInfo.logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      ) : null}
      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        {businessInfo.name || 'Business Name'}
      </span>
    </div>
  );

  const SlideFooter = ({ pageNum }: { pageNum: number }) => (
    <div className="absolute bottom-6 left-12 right-12 z-10 flex justify-between items-center text-white/40 text-[10px] font-bold tracking-widest">
      <span>{(businessInfo.whatsapp || '+27 79 448 6843')} · {(businessInfo.email || 'contact@business.com')}</span>
      <span>{String(pageNum).padStart(2, '0')} / 12</span>
    </div>
  );

  const SlideHeading = ({ title: t, kicker }: { title: string; kicker?: string }) => (
    <div className="relative z-10 mb-6">
      {kicker && <p className="text-[#A3E635] text-xs font-black uppercase tracking-[0.25em] mb-2">{kicker}</p>}
      <h2 className="text-4xl font-black text-white leading-tight">{t}</h2>
    </div>
  );

  const Card = ({ children, className = '', style = {} }: any) => (
    <div
      className={className}
      style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 16, padding: 20, position: 'relative', zIndex: 1, ...style }}
    >
      {children}
    </div>
  );

  const Slide = ({ children, pageNum }: { children: React.ReactNode; pageNum: number }) => (
    <div
      className="deck-slide page-break relative flex flex-col overflow-visible"
      style={{ width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX, padding: '48px 64px', ...SlideStyle }}
    >
      <Blob />
      {children}
      <SlideFooter pageNum={pageNum} />
    </div>
  );

  const ViabilityDonut = ({ score }: { score: number }) => (
    <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
        <circle cx="100" cy="100" r="80" fill="none" stroke="#A3E635" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(score / 100) * 502} 502`} />
      </svg>
      <div className="flex flex-col items-center justify-center relative z-10 gap-0.5">
        <span className="text-4xl font-black text-white leading-none">{score}</span>
        <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">/ 100</span>
      </div>
    </div>
  );

  const productImages: string[] = data.productImages || [];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center p-4 bg-black/95 overflow-y-auto w-full custom-scrollbar">
      <div className="fixed top-6 right-6 z-50 flex gap-4 no-print">
        {isExporting && (
          <button
            onClick={handleCancelExport}
            className="px-6 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 font-black flex items-center gap-2 rounded-xl transition-all"
          >
            <X size={20} />
            <div className="flex flex-col items-start text-left">
              <span>Cancel</span>
            </div>
          </button>
        )}
        <button
          onClick={() => setOrientation(o => o === 'landscape' ? 'portrait' : 'landscape')}
          disabled={isExporting}
          className="px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold flex items-center gap-2 rounded-xl transition-all backdrop-blur-md"
        >
          {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
        </button>
        <button
          onClick={handlePrint}
          disabled={isExporting}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black flex items-center gap-2 rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]"
        >
          {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
          <div className="flex flex-col items-start text-left">
            <span>{isExporting ? 'Generating Deck...' : 'Export Pitch Deck PDF'}</span>
            {isExporting && exportProgress && (
              <span className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold">Processing slide {exportProgress.current} of {exportProgress.total}</span>
            )}
          </div>
        </button>
        <button onClick={onClose} disabled={isExporting} className="p-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white transition-all backdrop-blur-md">
          <X size={24} />
        </button>
      </div>

      <div ref={printRef} className="relative my-12 mx-auto flex flex-col gap-8 font-sans">

        {/* 1. Cover */}
        <Slide pageNum={1}>
          <LogoHeader />
          <div className="flex-1 flex flex-col justify-center relative z-10">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#A3E635] to-green-400 mb-8 rounded-full" />
            <p className="text-[#A3E635] text-lg font-bold uppercase tracking-[0.3em] mb-3">Pitch Deck</p>
            <h1 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'white', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 16 }}>
              {businessInfo.name || 'Business Name'}
            </h1>
            <p className="text-xl text-white/85 font-light max-w-2xl">{data.tagline}</p>
            <p className="text-base text-[#A3E635] font-bold mt-4">{data.hook}</p>
          </div>
        </Slide>

        {/* 2. Problem */}
        <Slide pageNum={2}>
          <LogoHeader />
          <SlideHeading kicker="The Challenge" title="The Problem" />
          <div className="flex-1 flex items-center relative z-10">
            <Card style={{ borderLeft: '4px solid #F87171', maxWidth: '85%' }}>
              <p className="text-2xl text-white font-medium leading-relaxed">{data.problem}</p>
            </Card>
          </div>
        </Slide>

        {/* 3. Solution */}
        <Slide pageNum={3}>
          <LogoHeader />
          <SlideHeading kicker="Our Answer" title="The Solution" />
          <div className="flex-1 flex items-center relative z-10">
            <Card style={{ borderLeft: '4px solid #A3E635', maxWidth: '85%', background: 'rgba(163,230,53,0.12)' }}>
              <p className="text-2xl text-white font-medium leading-relaxed">{data.solution}</p>
            </Card>
          </div>
        </Slide>

        {/* 4. Viability Score */}
        {data.viabilityScore && (
          <Slide pageNum={4}>
            <LogoHeader />
            <SlideHeading kicker="Investor Confidence" title="Viability Score" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col items-center justify-center gap-6' : 'items-center gap-12'} relative z-10`}>
              <ViabilityDonut score={data.viabilityScore.overall} />
              <div className="grid grid-cols-2 gap-3 flex-1">
                {[
                  { label: 'Market Opportunity', key: 'marketOpportunity' },
                  { label: 'Team Strength', key: 'teamStrength' },
                  { label: 'Financial Viability', key: 'financialViability' },
                  { label: 'Social Impact', key: 'socialImpact' },
                  { label: 'Competitive Position', key: 'competitivePosition' },
                ].map((m) => (
                  <Card key={m.key} style={{ padding: 12 }}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px] font-bold text-white/70">{m.label}</span>
                      <span className="text-xs font-black text-[#A3E635]">{data.viabilityScore[m.key]}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-[#A3E635] h-1.5 rounded-full" style={{ width: `${data.viabilityScore[m.key]}%` }} />
                    </div>
                  </Card>
                ))}
                <Card style={{ padding: 12 }}>
                  <p className="text-[11px] text-white/80 leading-snug">{data.viabilityScore.reasoning}</p>
                </Card>
              </div>
            </div>
          </Slide>
        )}

        {/* 5. Market Opportunity */}
        {data.marketSize && (
          <Slide pageNum={5}>
            <LogoHeader />
            <SlideHeading kicker="Sizing the Opportunity" title="Market Size" />
            <div className="flex-1 flex items-center gap-10 relative z-10">
              <div className="relative shrink-0" style={{ width: 240, height: 240 }}>
                <svg width="240" height="240" viewBox="0 0 240 240">
                  <circle cx="120" cy="120" r="110" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <circle cx="120" cy="120" r="75" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
                  <circle cx="120" cy="120" r="42" fill="rgba(163,230,53,0.3)" stroke="#A3E635" strokeWidth="2" />
                  <text x="120" y="118" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">SOM</text>
                </svg>
              </div>
              <div className="flex-1 space-y-3">
                {[
                  { label: 'TAM', value: data.marketSize.tam },
                  { label: 'SAM', value: data.marketSize.sam },
                  { label: 'SOM', value: data.marketSize.som },
                ].map((m) => (
                  <Card key={m.label} style={{ padding: 14 }}>
                    <div className="flex gap-4 items-center">
                      <span className="px-3 py-1 rounded-lg text-xs font-black bg-[#A3E635] text-[#1e1b4b] shrink-0">{m.label}</span>
                      <p className="text-base text-white font-bold">{m.value}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Slide>
        )}

        {/* 6. Products & Services */}
        {data.topProducts && (
          <Slide pageNum={6}>
            <LogoHeader />
            <SlideHeading kicker="What We Offer" title="Products & Services" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-6' : 'gap-6'} relative z-10`}>
              <div className="flex-1 space-y-3">
                {data.topProducts.map((item: any, i: number) => (
                  <Card key={i} className="flex items-start gap-4">
                    <div className="w-8 h-8 shrink-0 rounded-full border-2 border-[#A3E635] flex items-center justify-center text-[#A3E635] font-bold text-sm">{i + 1}</div>
                    <div>
                      <h3 className="text-base font-bold text-white mb-1">{item.name}</h3>
                      <p className="text-white/80 text-sm mb-2">{item.description}</p>
                      <span className="text-xs font-bold text-[#A3E635]">{item.price}</span>
                    </div>
                  </Card>
                ))}
              </div>
              {productImages.length > 0 && (
                <div className="w-64 shrink-0 grid grid-cols-2 gap-3 content-start">
                  {productImages.slice(0, 4).map((url, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
                      <img src={url} alt="Product" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Slide>
        )}

        {/* 7. Business Model */}
        {data.businessModel && (
          <Slide pageNum={7}>
            <LogoHeader />
            <SlideHeading kicker="How We Make Money" title="Business Model" />
            <div className="flex-1 flex flex-col gap-4 justify-center relative z-10">
              <Card style={{ background: 'rgba(163,230,53,0.12)', borderColor: '#A3E635' }}>
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-2">Primary Revenue Stream</p>
                <p className="text-xl text-white font-bold">{data.businessModel.primaryRevenueStream}</p>
              </Card>
              {data.businessModel.secondaryRevenueStream && (
                <Card>
                  <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-2">Secondary Revenue Stream</p>
                  <p className="text-xl text-white font-bold">{data.businessModel.secondaryRevenueStream}</p>
                </Card>
              )}
            </div>
          </Slide>
        )}

        {/* 8. Competitive Positioning */}
        {data.competitors && (
          <Slide pageNum={8}>
            <LogoHeader />
            <SlideHeading kicker="Where We Stand" title="Competitive Positioning" />
            <div className="flex-1 relative z-10">
              <div style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 16, padding: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(109,40,217,0.85)' }}>
                      {['Competitor', 'Quality', 'Pricing', 'Innovation', 'Key Weakness'].map((c, i) => (
                        <th key={i} style={{ color: 'white', fontWeight: 800, padding: '8px 12px', fontSize: 12, textAlign: i === 0 || i === 4 ? 'left' : 'center' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.map((c: any, i: number) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.80)' }}>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, fontWeight: 700 }}>{c.name}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, textAlign: 'center' }}>{c.productQuality}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, textAlign: 'center' }}>{c.pricing}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12, textAlign: 'center' }}>{c.innovation}</td>
                        <td style={{ color: '#1e1b4b', padding: '7px 12px', fontSize: 12 }}>{c.keyWeakness}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Slide>
        )}

        {/* 9. Go-To-Market */}
        {data.goToMarket && (
          <Slide pageNum={9}>
            <LogoHeader />
            <SlideHeading kicker="Reaching Customers" title="Go-To-Market" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-6' : 'gap-6'} relative z-10`}>
              <Card className="flex-1">
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Channels</p>
                <ul className="space-y-2">
                  {data.goToMarket.channels?.map((c: string, i: number) => (
                    <li key={i} className="text-white/85 text-sm flex items-start gap-2">
                      <span className="text-[#A3E635] shrink-0">→</span> {c}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="flex-1" style={{ background: 'rgba(163,230,53,0.12)', borderColor: '#A3E635' }}>
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Headline Milestone</p>
                <p className="text-lg text-white font-bold leading-relaxed">{data.goToMarket.headlineMilestone}</p>
              </Card>
            </div>
          </Slide>
        )}

        {/* 10. Team */}
        {data.team && (
          <Slide pageNum={10}>
            <LogoHeader />
            <SlideHeading kicker="Who's Building This" title="Team" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-5' : 'flex-row gap-5'} relative z-10`}>
              {data.team.map((member: any, i: number) => (
                <Card key={i} className="flex-1 flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-[#1e1b4b] font-black text-xl mb-3">
                    {member.role?.charAt(0)}
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">{member.role}</h3>
                  <p className="text-white/75 text-sm">{member.oneLiner}</p>
                </Card>
              ))}
            </div>
          </Slide>
        )}

        {/* 11. The Ask */}
        {data.theAsk && (
          <Slide pageNum={11}>
            <LogoHeader />
            <SlideHeading kicker="What We Need" title="The Ask" />
            <div className={`flex-1 flex ${isPortrait ? 'flex-col justify-center gap-6' : 'gap-6'} relative z-10`}>
              <Card style={{ background: 'rgba(163,230,53,0.15)', borderColor: '#A3E635' }} className="flex flex-col justify-center" >
                <p className="text-xs text-[#A3E635] font-bold uppercase tracking-widest mb-2">Funding Required</p>
                <p className="text-3xl font-black text-white mb-4">{data.theAsk.fundingAmount}</p>
                {productImages[0] && (
                  <img src={productImages[0]} alt="Product" className="w-full h-28 object-cover rounded-lg border border-white/20" />
                )}
              </Card>
              <Card className="flex-1">
                <p className="text-xs font-black text-[#A3E635] uppercase tracking-widest mb-3">Use of Funds</p>
                <div className="space-y-2 mb-4">
                  {data.theAsk.useOfFunds?.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm border-b border-white/10 pb-2 last:border-0">
                      <span className="text-white/80">{item.category}</span>
                      <span className="text-white font-bold">{item.amount}</span>
                    </div>
                  ))}
                </div>
                {data.theAsk.revenueSnapshot && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                    {['y1', 'y2', 'y3'].map((y, i) => (
                      <div key={y} className="text-center bg-white/5 rounded-lg p-2">
                        <p className="text-[10px] text-white/50 uppercase">Year {i + 1}</p>
                        <p className="text-sm font-black text-white">{data.theAsk.revenueSnapshot[y as 'y1'|'y2'|'y3']}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </Slide>
        )}

        {/* 12. Closing */}
        <Slide pageNum={12}>
          <LogoHeader />
          <div className="flex-1 flex flex-col justify-center items-center text-center relative z-10">
            <p className="text-2xl text-white font-medium leading-relaxed max-w-3xl mb-6">{data.closingStatement}</p>
            <div className="w-16 h-1 bg-[#A3E635] rounded-full mb-6" />
            <p className="text-[#A3E635] font-bold uppercase tracking-widest text-sm">Let's Build This Together</p>
          </div>
        </Slide>

      </div>
    </div>
  );
};

export default PitchDeckDocument;

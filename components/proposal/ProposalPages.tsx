// components/proposal/ProposalPages.tsx
/**
 * StacFund — Proposal page renderers
 * ===================================
 * ONE renderer, THREE looks. Every visual decision comes from the template's
 * design tokens (services/proposal/proposalTemplates.ts) plus a few style
 * flags — so adding a 4th premium template stays a data-only change.
 *
 * Pages are A4 at 96dpi: 794 x 1123 px, exactly like BusinessPlanDocument,
 * and carry the `.pdf-page` class so utils/pdfExporter finds them. Pages use
 * min-height (never fixed height) so long AI content grows the page and the
 * exporter's 'slice' mode splits it across PDF pages instead of cropping it.
 *
 * Ancestor transforms (the preview's zoom scale) do NOT affect html2canvas —
 * it captures each element's own layout box — so the live preview can zoom
 * freely while exports stay full-resolution.
 */
import React from 'react';
import {
  type ProposalDocument,
  type ProposalSection,
  type ProposalMeta,
  activeSections,
} from '../../services/proposal/proposalSchema';
import {
  type ProposalTemplate,
  resolveAccent,
  withAlpha,
} from '../../services/proposal/proposalTemplates';

export const A4_WIDTH_PX = 794;
export const A4_MIN_HEIGHT_PX = 1123;

// ─── Shared bits ─────────────────────────────────────────────────────────────

/**
 * Renders paragraph text with [square-bracket placeholders] highlighted in the
 * accent color — AI writes placeholders where a real figure is unknown, and
 * the highlight tells the applicant exactly what to replace.
 */
const RichText: React.FC<{ text: string; accent: string; ink: string; size?: number }> = ({ text, accent, ink, size = 15 }) => {
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <p style={{ margin: '0 0 14px', fontSize: size, lineHeight: 1.75, color: ink }}>
      {parts.map((part, i) =>
        part.startsWith('[') && part.endsWith(']') ? (
          <span key={i} style={{ color: accent, fontStyle: 'italic', fontWeight: 600 }}>
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </p>
  );
}

function SectionTable({ section, template, accent }: { section: ProposalSection; template: ProposalTemplate; accent: string }) {
  if (!section.table || !section.table.rows.length) return null;
  const { columns, rows, caption } = section.table;
  const p = template.palette;
  return (
    <div style={{ marginTop: 26 }}>
      {caption && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: template.style === 'minimal' ? p.inkSoft : accent,
            marginBottom: 10,
            fontFamily: template.fonts.body,
          }}
        >
          {caption}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: template.fonts.body }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                style={{
                  textAlign: i === 0 ? 'left' : 'left',
                  padding: '10px 12px',
                  background: p.tableHead,
                  color: p.tableHeadInk,
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderBottom: `2px solid ${accent}`,
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? withAlpha(p.border, 0.35) : 'transparent' }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: '9px 12px',
                    color: ci === 0 ? p.ink : p.inkSoft,
                    fontWeight: ci === 0 ? 600 : 400,
                    borderBottom: `1px solid ${p.border}`,
                    verticalAlign: 'top',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatRow({ section, template, accent }: { section: ProposalSection; template: ProposalTemplate; accent: string }) {
  if (!section.stats.length) return null;
  const p = template.palette;
  const isEditorial = template.style === 'editorial';
  const isCorporate = template.style === 'corporate';

  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 26, flexWrap: 'wrap' }}>
      {section.stats.map((s, i) => (
        <div
          key={i}
          style={{
            flex: '1 1 0',
            minWidth: 130,
            padding: isEditorial ? '18px 16px' : '16px 16px',
            background: isCorporate ? withAlpha(accent, 0.08) : isEditorial ? 'transparent' : withAlpha(accent, 0.05),
            border: isEditorial ? `1px solid ${p.border}` : 'none',
            borderLeft: !isEditorial ? `3px solid ${accent}` : undefined,
            borderRadius: isCorporate ? 4 : 0,
            textAlign: isEditorial ? 'center' : 'left',
          }}
        >
          <div
            style={{
              fontFamily: isEditorial ? template.fonts.display : template.fonts.body,
              fontSize: isEditorial ? 30 : 26,
              fontWeight: isEditorial ? 600 : 800,
              color: accent,
              lineHeight: 1.1,
              marginBottom: 6,
            }}
          >
            {s.value}
          </div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: p.inkSoft, fontWeight: 600 }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Cover page ──────────────────────────────────────────────────────────────

export function CoverPage({ meta, template, accentOverride, logoUrl }: { meta: ProposalMeta; template: ProposalTemplate; accentOverride?: string; logoUrl?: string }) {
  const accent = resolveAccent(template, accentOverride);
  const p = template.palette;
  const isEditorial = template.style === 'editorial';
  const isCorporate = template.style === 'corporate';

  const logo = logoUrl ? (
    <img
      src={logoUrl}
      alt={`${meta.businessName} logo`}
      style={{ maxHeight: 56, maxWidth: 180, objectFit: 'contain', display: 'block' }}
    />
  ) : null;

  const pageStyle: React.CSSProperties = {
    width: A4_WIDTH_PX,
    minHeight: A4_MIN_HEIGHT_PX,
    background: p.coverBg,
    color: p.coverInk,
    padding: '84px 76px',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    position: 'relative',
    fontFamily: template.fonts.body,
  };

  if (isCorporate) {
    return (
      <div className="pdf-page" style={pageStyle}>
        <div style={{ height: 6, background: accent, width: 120, marginBottom: 'auto' }} />
        {logo ? <div style={{ marginBottom: 26 }}>{logo}</div> : null}
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent, fontWeight: 700, marginBottom: 26 }}>
            Funding Proposal
          </div>
          <div
            style={{
              fontFamily: template.fonts.display,
              fontSize: 54,
              fontWeight: 700,
              lineHeight: 1.12,
              marginBottom: 22,
              maxWidth: 560,
            }}
          >
            {meta.businessName}
          </div>
          <div style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.85, maxWidth: 480, marginBottom: 8 }}>{meta.tagline}</div>
          {meta.requestedAmountLabel && (
            <div style={{ fontSize: 15, marginTop: 18, color: accent, fontWeight: 700, letterSpacing: '0.04em' }}>
              Funding requested: {meta.requestedAmountLabel}
            </div>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${withAlpha(p.coverInk, 0.25)}`, paddingTop: 22, display: 'flex', justifyContent: 'space-between', fontSize: 12.5, opacity: 0.9 }}>
          <div>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, opacity: 0.7, marginBottom: 5 }}>Prepared for</div>
            <div style={{ fontWeight: 700 }}>{meta.preparedFor}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, opacity: 0.7, marginBottom: 5 }}>{meta.dateLabel}</div>
            {meta.preparedBy && <div style={{ fontWeight: 700 }}>{meta.preparedBy}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (isEditorial) {
    return (
      <div className="pdf-page" style={pageStyle}>
        <div style={{ textAlign: 'center', marginTop: 90 }}>
          {logo ? <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 30 }}>{logo}</div> : null}
          <div style={{ fontSize: 12, letterSpacing: '0.34em', textTransform: 'uppercase', color: accent, fontWeight: 700, marginBottom: 34 }}>
            Funding Proposal
          </div>
          <div style={{ width: 56, height: 2, background: accent, margin: '0 auto 38px' }} />
          <div
            style={{
              fontFamily: template.fonts.display,
              fontSize: 60,
              fontWeight: 600,
              lineHeight: 1.1,
              marginBottom: 26,
            }}
          >
            {meta.businessName}
          </div>
          <div style={{ fontSize: 18, fontStyle: 'italic', fontFamily: template.fonts.display, color: p.inkSoft, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
            {meta.tagline}
          </div>
          {meta.requestedAmountLabel && (
            <div style={{ marginTop: 30, display: 'inline-block', border: `1px solid ${accent}`, color: accent, padding: '10px 26px', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
              {meta.requestedAmountLabel}
            </div>
          )}
        </div>
        <div style={{ marginTop: 'auto', borderTop: `1px solid ${p.border}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: p.inkSoft }}>
          <div>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, marginBottom: 5 }}>Prepared for</div>
            <div style={{ color: p.ink, fontWeight: 700 }}>{meta.preparedFor}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, marginBottom: 5 }}>{meta.dateLabel}</div>
            {meta.preparedBy && <div style={{ color: p.ink, fontWeight: 700 }}>{meta.preparedBy}</div>}
          </div>
        </div>
      </div>
    );
  }

  // minimal
  return (
    <div className="pdf-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'auto' }}>
        {logo ? (
          <>
            {logo}
            <div style={{ fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: p.inkSoft, fontWeight: 700, marginLeft: 8 }}>Funding Proposal</div>
          </>
        ) : (
          <>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />
            <div style={{ fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: p.inkSoft, fontWeight: 700 }}>Funding Proposal</div>
          </>
        )}
      </div>
      <div>
        <div
          style={{
            fontSize: 58,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.08,
            marginBottom: 24,
            maxWidth: 560,
          }}
        >
          {meta.businessName}
          <span style={{ color: accent }}>.</span>
        </div>
        <div style={{ fontSize: 19, color: p.inkSoft, lineHeight: 1.6, maxWidth: 460, marginBottom: 10 }}>{meta.tagline}</div>
        {meta.requestedAmountLabel && (
          <div style={{ marginTop: 26, fontSize: 15, fontWeight: 700, color: accent }}>{meta.requestedAmountLabel} requested</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 60, borderTop: `1px solid ${p.border}`, paddingTop: 24, fontSize: 12.5 }}>
        <div>
          <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, color: p.inkSoft, marginBottom: 5 }}>Prepared for</div>
          <div style={{ fontWeight: 700 }}>{meta.preparedFor}</div>
        </div>
        <div>
          <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, color: p.inkSoft, marginBottom: 5 }}>Date</div>
          <div style={{ fontWeight: 700 }}>{meta.dateLabel}</div>
        </div>
        {meta.preparedBy && (
          <div>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10, color: p.inkSoft, marginBottom: 5 }}>Prepared by</div>
            <div style={{ fontWeight: 700 }}>{meta.preparedBy}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section page ────────────────────────────────────────────────────────────

function SectionNumber({ n, template, accent }: { n: number; template: ProposalTemplate; accent: string }) {
  const label = String(n).padStart(2, '0');
  if (template.numberStyle === 'boxed') {
    return (
      <div
        style={{
          width: 44,
          height: 44,
          background: accent,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: template.fonts.display,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    );
  }
  if (template.numberStyle === 'serif-figure') {
    return (
      <div style={{ fontFamily: template.fonts.display, fontSize: 52, fontWeight: 600, color: accent, lineHeight: 1 }}>{label}</div>
    );
  }
  return (
    <div style={{ fontFamily: template.fonts.body, fontSize: 15, fontWeight: 800, color: accent, letterSpacing: '0.08em' }}>{label}</div>
  );
}

export const SectionPage: React.FC<{
  section: ProposalSection;
  index: number;
  template: ProposalTemplate;
  accentOverride?: string;
}> = ({ section, index, template, accentOverride }) => {
  const accent = resolveAccent(template, accentOverride);
  const p = template.palette;
  const isCorporate = template.style === 'corporate';

  const titleBlock =
    template.style === 'editorial' ? (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 8 }}>
        <SectionNumber n={index} template={template} accent={accent} />
        <div>
          <div
            style={{
              fontFamily: template.fonts.display,
              fontSize: 33,
              fontWeight: 600,
              lineHeight: 1.15,
              color: p.ink,
            }}
          >
            {section.title}
          </div>
        </div>
      </div>
    ) : template.style === 'corporate' ? (
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <SectionNumber n={index} template={template} accent={accent} />
          <div style={{ height: 1, flex: 1, background: withAlpha(p.ink, 0.15) }} />
        </div>
        <div
          style={{
            fontFamily: template.fonts.display,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.3,
            color: p.ink,
            textTransform: 'none',
          }}
        >
          {section.title}
        </div>
      </div>
    ) : (
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 10 }}>
          <SectionNumber n={index} template={template} accent={accent} />
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2, color: p.ink }}>{section.title}</div>
        <div style={{ width: 52, height: 3, background: accent, marginTop: 16 }} />
      </div>
    );

  return (
    <div
      className="pdf-page"
      data-section-id={section.id}
      style={{
        width: A4_WIDTH_PX,
        minHeight: A4_MIN_HEIGHT_PX,
        background: p.page,
        padding: '72px 76px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: template.fonts.body,
        borderTop: isCorporate ? `6px solid ${accent}` : undefined,
      }}
    >
      {titleBlock}

      <div style={{ marginTop: template.style === 'editorial' ? 18 : 8 }}>
        {section.status === 'outline' ? (
          <div style={{ padding: '34px 0', color: p.inkSoft, fontStyle: 'italic', fontSize: 15 }}>
            Section drafted in the outline — click “Write this section” to generate the full text.
          </div>
        ) : (
          <>
            {section.paragraphs.map((para, i) => (
              <RichText key={i} text={para} accent={accent} ink={p.ink} />
            ))}

            {section.bullets.length > 0 && (
              <div style={{ margin: '20px 0 6px' }}>
                {section.bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                    <div
                      style={{
                        marginTop: 9,
                        width: template.style === 'editorial' ? 6 : 7,
                        height: template.style === 'editorial' ? 6 : 7,
                        borderRadius: '50%',
                        background: accent,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ fontSize: 14.5, lineHeight: 1.65, color: p.ink }}>{b}</div>
                  </div>
                ))}
              </div>
            )}

            <StatRow section={section} template={template} accent={accent} />
            <SectionTable section={section} template={template} accent={accent} />
          </>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 30, display: 'flex', justifyContent: 'space-between', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: withAlpha(p.inkSoft, 0.9) }}>
        <span>{section.deterministic ? 'Checklist' : `Section ${String(index).padStart(2, '0')}`}</span>
        <span>{template.name} · StacFund</span>
      </div>
    </div>
  );
}

// ─── Closing page ────────────────────────────────────────────────────────────

export function ClosingPage({ meta, template, accentOverride }: { meta: ProposalMeta; template: ProposalTemplate; accentOverride?: string }) {
  const accent = resolveAccent(template, accentOverride);
  const p = template.palette;
  return (
    <div
      className="pdf-page"
      style={{
        width: A4_WIDTH_PX,
        minHeight: A4_MIN_HEIGHT_PX,
        background: template.style === 'corporate' ? p.coverBg : p.page,
        color: template.style === 'corporate' ? p.coverInk : p.ink,
        padding: '84px 76px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        fontFamily: template.fonts.body,
      }}
    >
      <div style={{ width: 56, height: template.style === 'editorial' ? 2 : 5, background: accent, marginBottom: 34 }} />
      <div
        style={{
          fontFamily: template.fonts.display,
          fontSize: template.style === 'editorial' ? 40 : 30,
          fontWeight: template.style === 'editorial' ? 600 : 700,
          lineHeight: 1.25,
          marginBottom: 22,
          maxWidth: 520,
        }}
      >
        Thank you for the opportunity to present this proposal.
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.8, opacity: 0.85, maxWidth: 480, marginBottom: 40 }}>
        {meta.businessName} welcomes any questions and is available to provide additional documentation, references, or a
        walkthrough of the plan at your convenience.
      </div>
      <div style={{ borderTop: `1px solid ${template.style === 'corporate' ? withAlpha(p.coverInk, 0.3) : p.border}`, paddingTop: 24, fontSize: 13.5, lineHeight: 2 }}>
        {meta.preparedBy && (
          <div>
            <span style={{ opacity: 0.65 }}>Prepared by </span>
            <strong>{meta.preparedBy}</strong>
          </div>
        )}
        {meta.contactLine && (
          <div>
            <span style={{ opacity: 0.65 }}>Contact </span>
            <strong>{meta.contactLine}</strong>
          </div>
        )}
        <div>
          <span style={{ opacity: 0.65 }}>Submitted for consideration to </span>
          <strong>{meta.preparedFor}</strong>
        </div>
        <div style={{ opacity: 0.65 }}>{meta.dateLabel}</div>
      </div>
    </div>
  );
}

// ─── Whole document ──────────────────────────────────────────────────────────

export function ProposalDocumentPages({
  doc,
  template,
  hideClosing = false,
  logoUrl,
}: {
  doc: ProposalDocument;
  template: ProposalTemplate;
  hideClosing?: boolean;
  /** Brand-kit logo (live-applied at render, never stored on the doc). */
  logoUrl?: string;
}) {
  const sections = activeSections(doc);
  return (
    <div>
      <CoverPage meta={doc.meta} template={template} accentOverride={doc.accentOverride} logoUrl={logoUrl} />
      {sections.map((s, i) => (
        <SectionPage key={s.id} section={s} index={i + 1} template={template} accentOverride={doc.accentOverride} />
      ))}
      {!hideClosing && <ClosingPage meta={doc.meta} template={template} accentOverride={doc.accentOverride} />}
    </div>
  );
}

// ─── Gallery mini preview ────────────────────────────────────────────────────

/**
 * WYSIWYG gallery thumbnail: renders the REAL cover page (with sample meta)
 * scaled down inside a fixed box — what the user sees is exactly what prints.
 */
export function TemplateMiniPreview({ template, accentOverride }: { template: ProposalTemplate; accentOverride?: string }) {
  const sampleMeta: ProposalMeta = {
    businessName: 'Lerato Logistics',
    tagline: 'Last-mile distribution for township retailers',
    preparedFor: 'SEFA Development Funding',
    preparedBy: 'L. Mokoena',
    dateLabel: 'October 2026',
    requestedAmountLabel: 'R500 000',
    contactLine: '',
  };
  const scale = 168 / A4_WIDTH_PX;
  return (
    <div
      style={{
        width: 168,
        height: 238,
        overflow: 'hidden',
        borderRadius: 6,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
        background: '#fff',
        position: 'relative',
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <CoverPage meta={sampleMeta} template={template} accentOverride={accentOverride} />
      </div>
    </div>
  );
}

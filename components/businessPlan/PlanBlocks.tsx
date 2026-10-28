// components/businessPlan/PlanBlocks.tsx
/**
 * StacFund — Institutional (Venturekit-class) block & page renderers
 * ==================================================================
 * Professional and sober, by design:
 *   - text-first: serif body, restrained headings, no decorative graphics
 *   - minimal branding: one accent colour, thin rules, small-caps labels
 *   - graphs only where they earn their place (revenue, cash flow, break-even)
 *
 * EVERYTHING IS INLINE-STYLED on purpose: the on-screen preview serialises to
 * standalone HTML for the server-side Playwright text-PDF export, so no
 * Tailwind classes or external CSS may leak into page content.
 */
import React from 'react';
import type {
  PlanBlock, PlanChart, PlanDocument, PlanMeta, PlanStat,
} from '../../services/businessPlan/planSchema';
import {
  PAGE_W, PAGE_H, MARGIN_X, CONTENT_W, CONTENT_TOP, BLOCK_GAP,
} from './planPaginate';

// ─── Theme ───────────────────────────────────────────────────────────────────

export interface PlanTheme {
  id: string;
  name: string;
  accent: string;        // primary accent (rules, chapter numbers)
  accentDark: string;    // stat values, strong text
  ink: string;           // body text
  inkSoft: string;       // secondary text
  rule: string;          // hairlines
  wash: string;          // callout / chip backgrounds
  page: string;          // page background
}

export const PLAN_THEMES: PlanTheme[] = [
  { id: 'navy', name: 'Institutional Navy', accent: '#1F3A5F', accentDark: '#16293F', ink: '#1E293B', inkSoft: '#5B6B7C', rule: '#DCE3EA', wash: '#F5F8FB', page: '#FFFFFF' },
  { id: 'emerald', name: 'Fiscal Green', accent: '#0F6B4F', accentDark: '#0A4A37', ink: '#1C2B26', inkSoft: '#5C6E67', rule: '#DDE7E2', wash: '#F4FAF7', page: '#FFFFFF' },
  { id: 'maroon', name: 'Boardroom Maroon', accent: '#7A2E2E', accentDark: '#5A1F1F', ink: '#2B1E1E', inkSoft: '#7A6666', rule: '#EADCDC', wash: '#FBF6F6', page: '#FFFFFF' },
  { id: 'slate', name: 'Neutral Slate', accent: '#37474F', accentDark: '#263238', ink: '#212B30', inkSoft: '#5F6E76', rule: '#DFE5E8', wash: '#F5F7F8', page: '#FFFFFF' },
];

export function getPlanTheme(id: string | undefined): PlanTheme {
  return PLAN_THEMES.find((t) => t.id === id) || PLAN_THEMES[0];
}

/** Parses #RRGGBB → [r,g,b]; returns null on anything else. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Mixes a color toward white (amt=0 → unchanged, amt=1 → white). */
function tint(hex: string, amt: number): string {
  const c = parseHex(hex);
  if (!c) return '#F5F8FB';
  return toHex(c[0] + (255 - c[0]) * amt, c[1] + (255 - c[1]) * amt, c[2] + (255 - c[2]) * amt);
}

/** Mixes a color toward black. */
function shade(hex: string, amt: number): string {
  const c = parseHex(hex);
  if (!c) return '#16293F';
  return toHex(c[0] * (1 - amt), c[1] * (1 - amt), c[2] * (1 - amt));
}

/**
 * Builds a full PlanTheme from the user's Brand Kit accent colour.
 * Neutrals stay institutional; only the accent (and its tints/shades) move.
 * Falls back to Institutional Navy when the hex is invalid.
 */
export function makePlanThemeFromAccent(hex: string): PlanTheme {
  const valid = parseHex(hex) ? `#${parseHex(hex)!.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}` : null;
  if (!valid) return PLAN_THEMES[0];
  return {
    id: 'brand',
    name: 'Brand accent',
    accent: valid,
    accentDark: shade(valid, 0.22),
    ink: '#1F2937',
    inkSoft: '#5B6B7C',
    rule: tint(valid, 0.86),
    wash: tint(valid, 0.94),
    page: '#FFFFFF',
  };
}

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";

// ─── Charts (minimal SVG — no images, prints crisp) ──────────────────────────

function fmtValue(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}m`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v * 10) / 10);
}

const ChartSvg: React.FC<{ chart: PlanChart; theme: PlanTheme }> = ({ chart, theme }) => {
  const W = CONTENT_W - 24; // inside a chart panel
  const H = chart.kind === 'donut' ? 170 : 200;
  const padL = 46, padR = 10, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const all = [...chart.points, ...(chart.points2 || [])];
  const max = Math.max(1, ...all.map((p) => p.value));
  const min = Math.min(0, ...all.map((p) => p.value));

  const y = (v: number) => padT + plotH - ((v - min) / (max - min || 1)) * plotH;
  const x = (i: number, n: number) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke={theme.rule} strokeWidth={1} />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill={theme.inkSoft} fontFamily={SANS}>{fmtValue(g)}</text>
        </g>
      ))}

      {chart.kind === 'bar' && chart.points.map((p, i) => {
        const n = chart.points.length;
        const bw = Math.min(64, (plotW / n) * 0.55);
        const cx = x(i, n);
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y(Math.max(p.value, 0))} width={bw} height={Math.max(1, y(min) - y(p.value))} fill={theme.accent} />
            <text x={cx} y={H - 10} textAnchor="middle" fontSize={9.5} fill={theme.inkSoft} fontFamily={SANS}>{p.label}</text>
          </g>
        );
      })}

      {chart.kind === 'line' && (
        <>
          {chart.points2 ? (
            <polyline
              points={chart.points2.map((p, i) => `${x(i, chart.points2!.length)},${y(p.value)}`).join(' ')}
              fill="none" stroke={theme.inkSoft} strokeWidth={1.6} strokeDasharray="4 3"
            />
          ) : null}
          <polyline
            points={chart.points.map((p, i) => `${x(i, chart.points.length)},${y(p.value)}`).join(' ')}
            fill="none" stroke={theme.accent} strokeWidth={2.2}
          />
          {chart.points.map((p, i) => (
            <circle key={i} cx={x(i, chart.points.length)} cy={y(p.value)} r={2.6} fill={theme.accent} />
          ))}
          {chart.points.map((p, i) => (
            <text key={`l${i}`} x={x(i, chart.points.length)} y={H - 10} textAnchor="middle" fontSize={9} fill={theme.inkSoft} fontFamily={SANS}>
              {p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}
            </text>
          ))}
        </>
      )}

      {chart.kind === 'donut' && (() => {
        const total = chart.points.reduce((s, p) => s + Math.abs(p.value), 0) || 1;
        const cx = W * 0.32, cy = H / 2, r = Math.min(62, H / 2 - 12);
        let acc = -Math.PI / 2;
        const shades = [theme.accent, theme.accentDark, '#8FA3B8', '#C4D0DB', '#E1E8EE'];
        return (
          <g>
            {chart.points.map((p, i) => {
              const frac = Math.abs(p.value) / total;
              const a0 = acc, a1 = acc + frac * Math.PI * 2;
              acc = a1;
              const large = a1 - a0 > Math.PI ? 1 : 0;
              const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
              const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
              return (
                <path key={i} d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`}
                  fill={shades[i % shades.length]} />
              );
            })}
            <circle cx={cx} cy={cy} r={r * 0.55} fill={theme.page} />
            {chart.points.map((p, i) => (
              <g key={`lg${i}`}>
                <rect x={W * 0.62} y={cy - chart.points.length * 11 + i * 22 + 4} width={9} height={9} fill={shades[i % shades.length]} />
                <text x={W * 0.62 + 16} y={cy - chart.points.length * 11 + i * 22 + 12} fontSize={10.5} fill={theme.ink} fontFamily={SANS}>
                  {p.label} ({Math.round((Math.abs(p.value) / total) * 100)}%)
                </text>
              </g>
            ))}
          </g>
        );
      })()}

      {(chart.seriesLabel || chart.seriesLabel2) && chart.kind === 'line' && (
        <g>
          <rect x={padL} y={2} width={10} height={3} fill={theme.accent} />
          {chart.seriesLabel && <text x={padL + 16} y={6} fontSize={9} fill={theme.inkSoft} fontFamily={SANS}>{chart.seriesLabel}</text>}
          <rect x={padL + 110} y={2} width={10} height={3} fill={theme.inkSoft} />
          {chart.seriesLabel2 && <text x={padL + 126} y={6} fontSize={9} fill={theme.inkSoft} fontFamily={SANS}>{chart.seriesLabel2}</text>}
        </g>
      )}
    </svg>
  );
};

// ─── Block renderers ─────────────────────────────────────────────────────────

const StatChip: React.FC<{ s: PlanStat; theme: PlanTheme }> = ({ s, theme }) => (
  <div style={{ flex: '1 1 0', minWidth: 0, border: `1px solid ${theme.rule}`, background: theme.wash, padding: '12px 14px', borderRadius: 2 }}>
    <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: theme.accentDark, lineHeight: 1.15 }}>{s.value}</div>
    <div style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.inkSoft, marginTop: 5, lineHeight: 1.35 }}>{s.label}</div>
  </div>
);

const ColList: React.FC<{ title: string; items: string[]; theme: PlanTheme }> = ({ title, items, theme }) => (
  <div style={{ flex: '1 1 0', minWidth: 0 }}>
    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.accentDark, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${theme.rule}` }}>{title}</div>
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 12.5, lineHeight: 1.5, color: theme.ink }}>
          <span style={{ color: theme.accent, lineHeight: 1.5, fontSize: 12.5 }}>▪</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  </div>
);

/** Renders one content block. NO margins — pages use flex gap (see paginator). */
export const PlanBlockView: React.FC<{ block: PlanBlock; theme: PlanTheme }> = React.memo(({ block, theme }) => {
  switch (block.type) {
    case 'paragraph':
      return <p style={{ margin: 0, fontFamily: SERIF, fontSize: 15, lineHeight: 1.66, color: theme.ink }}>{block.text}</p>;

    case 'heading':
      return <h4 style={{ margin: 0, fontFamily: SERIF, fontSize: 17.5, fontWeight: 700, color: theme.accentDark, lineHeight: 1.3 }}>{block.text}</h4>;

    case 'callout':
      return (
        <div style={{ borderLeft: `3px solid ${theme.accent}`, background: theme.wash, padding: '13px 18px' }}>
          <p style={{ margin: 0, fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.6, color: theme.accentDark }}>{block.text}</p>
        </div>
      );

    case 'bullets':
      return (
        <div>
          {block.title ? (
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.accentDark, marginBottom: 8 }}>{block.title}</div>
          ) : null}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {(block.items || []).map((it, i) => (
              <li key={i} style={{ display: 'flex', gap: 9, marginBottom: 7, fontSize: 13.5, lineHeight: 1.55, color: theme.ink }}>
                <span style={{ color: theme.accent }}>▪</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'sources':
      return (
        <div style={{ borderTop: `1px solid ${theme.rule}`, paddingTop: 9 }}>
          <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.inkSoft }}>Sources: </span>
          <span style={{ fontFamily: SERIF, fontSize: 11.5, fontStyle: 'italic', color: theme.inkSoft }}>{(block.items || []).join(' · ')}</span>
        </div>
      );

    case 'stats':
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          {(block.stats || []).map((s, i) => <StatChip key={i} s={s} theme={theme} />)}
        </div>
      );

    case 'twoCol':
      return (
        <div style={{ display: 'flex', gap: 22 }}>
          {block.left ? <ColList title={block.left.title} items={block.left.items} theme={theme} /> : <div style={{ flex: 1 }} />}
          {block.right ? <ColList title={block.right.title} items={block.right.items} theme={theme} /> : <div style={{ flex: 1 }} />}
        </div>
      );

    case 'table': {
      const t = block.table!;
      return (
        <div>
          {t.caption ? (
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: theme.inkSoft, marginBottom: 7 }}>{t.caption}</div>
          ) : null}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {t.columns.map((c, i) => (
                  <th key={i} style={{
                    textAlign: i === 0 ? 'left' : 'left', fontFamily: SANS, fontSize: 10.5, fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase', color: theme.accentDark,
                    borderBottom: `2px solid ${theme.accent}`, padding: '7px 9px', verticalAlign: 'bottom',
                    wordBreak: 'break-word',
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 1 ? theme.wash : 'transparent' }}>
                  {r.map((c, ci) => (
                    <td key={ci} style={{
                      fontFamily: SERIF, fontSize: 12.5, lineHeight: 1.45, color: theme.ink,
                      borderBottom: `1px solid ${theme.rule}`, padding: '7px 9px', verticalAlign: 'top',
                      wordBreak: 'break-word', whiteSpace: 'pre-line',
                    }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'swot': {
      const w = block.swot!;
      const quad = (title: string, items: string[]) => (
        <div style={{ flex: '1 1 50%', minWidth: 0, padding: '12px 14px', border: `1px solid ${theme.rule}`, background: theme.wash }}>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: theme.accentDark, marginBottom: 7 }}>{title}</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {items.map((it, i) => (
              <li key={i} style={{ display: 'flex', gap: 7, marginBottom: 6, fontSize: 12, lineHeight: 1.45, color: theme.ink }}>
                <span style={{ color: theme.accent }}>▪</span><span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      );
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', border: `1px solid ${theme.rule}`, background: theme.wash }}>
          {quad('Strengths', w.strengths)}
          {quad('Weaknesses', w.weaknesses)}
          {quad('Opportunities', w.opportunities)}
          {quad('Threats', w.threats)}
        </div>
      );
    }

    case 'kv': {
      const k = block.kv!;
      return (
        <div>
          {k.title ? (
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.accentDark, marginBottom: 7 }}>{k.title}</div>
          ) : null}
          <div style={{ border: `1px solid ${theme.rule}` }}>
            {k.rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', borderBottom: i < k.rows.length - 1 ? `1px solid ${theme.rule}` : 'none' }}>
                <div style={{ flex: '0 0 38%', padding: '8px 12px', fontFamily: SANS, fontSize: 11, fontWeight: 600, color: theme.inkSoft, background: theme.wash, lineHeight: 1.45 }}>{r.k}</div>
                <div style={{ flex: 1, padding: '8px 12px', fontFamily: SERIF, fontSize: 13, color: theme.ink, lineHeight: 1.5 }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'chart':
      return (
        <div style={{ border: `1px solid ${theme.rule}`, padding: '12px 12px 8px', background: theme.page }}>
          {block.chart!.title ? (
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: theme.inkSoft, marginBottom: 6 }}>{block.chart!.title}</div>
          ) : null}
          <ChartSvg chart={block.chart!} theme={theme} />
        </div>
      );

    default:
      return null;
  }
});
PlanBlockView.displayName = 'PlanBlockView';

// ─── Page frames ─────────────────────────────────────────────────────────────

const PageHeader: React.FC<{ meta: PlanMeta; theme: PlanTheme; label?: string }> = ({ meta, theme, label }) => (
  <div style={{ position: 'absolute', top: 40, left: MARGIN_X, right: MARGIN_X, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.inkSoft }}>{meta.businessName}</span>
    {label ? (
      <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.inkSoft }}>{label}</span>
    ) : null}
  </div>
);

const PageFooter: React.FC<{ pageNo: number; total: number; theme: PlanTheme }> = ({ pageNo, total, theme }) => (
  <div style={{ position: 'absolute', bottom: 34, left: MARGIN_X, right: MARGIN_X, textAlign: 'center' }}>
    <span style={{ fontFamily: SANS, fontSize: 9.5, color: theme.inkSoft, letterSpacing: '0.06em' }}>{pageNo} of {total}</span>
  </div>
);

/** The A4 frame shared by preview and export. */
export const PlanPageFrame: React.FC<{
  children: React.ReactNode;
  theme: PlanTheme;
  className?: string;
}> = ({ children, theme, className }) => (
  <div
    className={`pdf-page ${className || ''}`}
    style={{
      width: PAGE_W, height: PAGE_H, background: theme.page, position: 'relative',
      overflow: 'hidden', flex: '0 0 auto',
      fontFamily: SERIF, color: theme.ink,
    }}
  >
    {children}
  </div>
);

const ContentArea: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: 'absolute', top: CONTENT_TOP, left: MARGIN_X, width: CONTENT_W, ...style }}>
    {children}
  </div>
);

// ─── Cover ───────────────────────────────────────────────────────────────────

export const PlanCoverPage: React.FC<{ meta: PlanMeta; theme: PlanTheme; total: number; logoUrl?: string }> = ({ meta, theme, logoUrl }) => (
  <PlanPageFrame theme={theme}>
    {/* Minimal branding: a single accent rule + optional brand logo. */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: theme.accent }} />
    <div style={{ position: 'absolute', top: 150, left: MARGIN_X, right: MARGIN_X }}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${meta.businessName} logo`}
          style={{ maxHeight: 64, maxWidth: 208, objectFit: 'contain', objectPosition: 'left top', display: 'block', marginBottom: 22 }}
        />
      ) : null}
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: theme.accent }}>
        {meta.planTitle}
      </div>
      <div style={{ width: 64, height: 3, background: theme.accent, margin: '26px 0 34px' }} />
      <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 44, fontWeight: 700, lineHeight: 1.12, color: theme.ink }}>
        {meta.businessName}
      </h1>
      {meta.tagline ? (
        <p style={{ margin: '18px 0 0', fontFamily: SERIF, fontSize: 17, fontStyle: 'italic', color: theme.inkSoft, lineHeight: 1.5, maxWidth: 520 }}>
          {meta.tagline}
        </p>
      ) : null}
    </div>

    <div style={{ position: 'absolute', bottom: 120, left: MARGIN_X, right: MARGIN_X }}>
      <div style={{ display: 'flex', gap: 40 }}>
        <div style={{ flex: '0 0 40%' }}>
          <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.inkSoft, marginBottom: 8 }}>Prepared for</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: theme.ink, lineHeight: 1.45 }}>{meta.preparedFor}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.inkSoft, marginBottom: 8 }}>Prepared by</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: theme.ink, lineHeight: 1.45 }}>{meta.preparedBy || '—'}</div>
        </div>
      </div>
      {meta.requestedAmountLabel ? (
        <div style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${theme.rule}`, display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.inkSoft }}>Funding requested</span>
          <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: theme.accentDark }}>{meta.requestedAmountLabel}</span>
        </div>
      ) : null}
    </div>

    <div style={{ position: 'absolute', bottom: 58, left: MARGIN_X, right: MARGIN_X, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontFamily: SANS, fontSize: 10, color: theme.inkSoft }}>
        {[meta.contactEmail, meta.contactPhone, meta.contactWebsite].filter(Boolean).join('  ·  ') || '\u00A0'}
      </span>
      <span style={{ fontFamily: SANS, fontSize: 10, color: theme.inkSoft }}>{meta.dateLabel}</span>
    </div>
    {meta.contactAddress ? (
      <div style={{ position: 'absolute', bottom: 40, left: MARGIN_X, fontFamily: SANS, fontSize: 9, color: theme.inkSoft }}>{meta.contactAddress}</div>
    ) : null}
  </PlanPageFrame>
);

// ─── TOC ─────────────────────────────────────────────────────────────────────

export const PlanTocPage: React.FC<{
  rows: { label: string; pageNo: number; level: 'chapter' | 'subsection'; chapterNumber?: number }[];
  meta: PlanMeta; theme: PlanTheme; pageNo: number; total: number; showTitle: boolean;
}> = ({ rows, meta, theme, pageNo, total, showTitle }) => (
  <PlanPageFrame theme={theme}>
    <PageHeader meta={meta} theme={theme} />
    <ContentArea>
      {showTitle ? (
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: theme.ink }}>Table of Contents</h2>
          <div style={{ width: 48, height: 3, background: theme.accent, marginTop: 12 }} />
        </div>
      ) : null}
      <div>
        {rows.map((r, i) => (
          <div key={i} style={{ height: 27, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: r.level === 'subsection' ? 18 : 0 }}>
            {r.level === 'chapter' ? (
              <span style={{ fontFamily: SERIF, fontSize: 12.5, fontWeight: 700, color: theme.accentDark, width: 22 }}>{String(r.chapterNumber || '').padStart(2, '0')}</span>
            ) : null}
            <span style={{
              fontFamily: r.level === 'chapter' ? SERIF : SERIF,
              fontSize: r.level === 'chapter' ? 13 : 12,
              fontWeight: r.level === 'chapter' ? 700 : 400,
              color: r.level === 'chapter' ? theme.ink : theme.inkSoft,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto',
            }}>{r.label}</span>
            <span style={{ flex: 1, borderBottom: `1px dotted ${theme.rule}`, margin: '0 6px', transform: 'translateY(3px)' }} />
            <span style={{ fontFamily: SANS, fontSize: r.level === 'chapter' ? 11.5 : 11, fontWeight: r.level === 'chapter' ? 700 : 400, color: r.level === 'chapter' ? theme.ink : theme.inkSoft }}>{r.pageNo}</span>
          </div>
        ))}
      </div>
    </ContentArea>
    <PageFooter pageNo={pageNo} total={total} theme={theme} />
  </PlanPageFrame>
);

// ─── Chapter opener ──────────────────────────────────────────────────────────

export const PlanChapterOpener: React.FC<{
  chapter: PlanDocument['chapters'][number]; meta: PlanMeta; theme: PlanTheme; pageNo: number; total: number;
}> = ({ chapter, meta, theme, pageNo, total }) => (
  <PlanPageFrame theme={theme}>
    <PageHeader meta={meta} theme={theme} />
    <ContentArea style={{ top: Math.round(CONTENT_TOP + 130) }}>
      <div style={{ fontFamily: SERIF, fontSize: 88, fontWeight: 700, color: theme.accent, lineHeight: 1, opacity: 0.28 }}>
        {String(chapter.number).padStart(2, '0')}
      </div>
      <div style={{ width: 56, height: 3, background: theme.accent, margin: '22px 0 26px' }} />
      <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 34, fontWeight: 700, lineHeight: 1.15, color: theme.ink }}>{chapter.title}</h2>
      <p style={{ margin: '20px 0 0', fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.65, color: theme.inkSoft, maxWidth: 540 }}>{chapter.summary}</p>
      <div style={{ marginTop: 44 }}>
        <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.inkSoft, marginBottom: 12 }}>In this chapter</div>
        {chapter.subsections.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'baseline' }}>
            <span style={{ fontFamily: SANS, fontSize: 10, color: theme.accent, width: 18 }}>{`${chapter.number}.${i + 1}`}</span>
            <span style={{ fontFamily: SERIF, fontSize: 14.5, color: theme.ink }}>{s.title}</span>
          </div>
        ))}
      </div>
    </ContentArea>
    <PageFooter pageNo={pageNo} total={total} theme={theme} />
  </PlanPageFrame>
);

// ─── Content page ────────────────────────────────────────────────────────────

export const PlanContentPage: React.FC<{
  page: {
    blocks: PlanBlock[];
    subsectionTitle?: string;
    pending?: boolean;
    chapterId?: string;
    subsectionId?: string;
  };
  chapterTitle: string;
  meta: PlanMeta; theme: PlanTheme; pageNo: number; total: number;
}> = ({ page, chapterTitle, meta, theme, pageNo, total }) => (
  <PlanPageFrame theme={theme}>
    <PageHeader meta={meta} theme={theme} label={chapterTitle} />
    <ContentArea style={{ display: 'flex', flexDirection: 'column', gap: BLOCK_GAP, maxHeight: 1042 - CONTENT_TOP }}>
      {page.subsectionTitle ? (
        <div style={{ marginBottom: 2 }}>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 23, fontWeight: 700, lineHeight: 1.2, color: theme.ink }}>{page.subsectionTitle}</h3>
          <div style={{ width: 44, height: 3, background: theme.accent, marginTop: 10 }} />
        </div>
      ) : null}
      {page.blocks.map((b) => <PlanBlockView key={b.id} block={b} theme={theme} />)}
      {page.pending ? (
        <div style={{ border: `1px dashed ${theme.rule}`, padding: '26px 22px', textAlign: 'center' }}>
          <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.inkSoft }}>
            This section is being written…
          </span>
        </div>
      ) : null}
    </ContentArea>
    <PageFooter pageNo={pageNo} total={total} theme={theme} />
  </PlanPageFrame>
);

// ─── Measure layer (hidden; feeds the paginator exact heights) ──────────────

/**
 * Renders EVERY block of the document once, hidden, at the exact content
 * width. The Studio reads each wrapper's offsetHeight and passes a
 * heightOf() function to paginatePlan().
 */
export const PlanMeasureLayer: React.FC<{
  doc: PlanDocument; theme: PlanTheme; containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ doc, theme, containerRef }) => (
  <div
    ref={containerRef}
    aria-hidden="true"
    style={{ position: 'fixed', left: -20000, top: 0, width: CONTENT_W, visibility: 'hidden', pointerEvents: 'none' }}
  >
    {doc.chapters.map((c) =>
      c.subsections.map((s) =>
        s.blocks.map((b) => (
          <div key={b.id} data-mid={b.id}>
            <PlanBlockView block={b} theme={theme} />
          </div>
        ))
      )
    )}
  </div>
);

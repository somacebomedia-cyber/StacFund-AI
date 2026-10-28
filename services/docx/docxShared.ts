// services/docx/docxShared.ts
/**
 * StacFund — Shared DOCX building blocks (Word export)
 * =====================================================
 * Common machinery for the Word (.docx) exporters used by both studios.
 * Everything here is node-safe (no browser imports) so it can run in the
 * Express server and in the verify script.
 *
 * Design language mirrors the PDF templates: professional and sober —
 * serif body (Cambria), sans headings (Calibri), one accent colour, hairline
 * table borders, no decorative graphics. Charts export as data tables to
 * keep the document 100% text-first and editable.
 */
import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';

// ─── Brand payload (kept structurally compatible with services/brandKit.ts) ──

export interface DocxBrand {
  businessName?: string;
  tagline?: string;
  logoDataUrl?: string;
  logoWidth?: number;
  logoHeight?: number;
  accentColor?: string;
}

// ─── Colour helpers ──────────────────────────────────────────────────────────

const INK = '2A2F36';
const INK_SOFT = '6B7280';
const GRAY = '9AA1A9';

export function hex6(input: string | undefined, fallback: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(input || '').trim());
  return m ? m[1].toUpperCase() : fallback;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(parts: [number, number, number]): string {
  return parts
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Mix toward white (amt 0→unchanged, 1→white). */
export function tintHex(hex: string, amt: number): string {
  const c = rgb(hex);
  return toHex([c[0] + (255 - c[0]) * amt, c[1] + (255 - c[1]) * amt, c[2] + (255 - c[2]) * amt]);
}

/** Mix toward black. */
export function shadeHex(hex: string, amt: number): string {
  const c = rgb(hex);
  return toHex([c[0] * (1 - amt), c[1] * (1 - amt), c[2] * (1 - amt)]);
}

// ─── Fonts & spacing ─────────────────────────────────────────────────────────

export const BODY_FONT = 'Cambria';     // Word's guaranteed serif
export const HEAD_FONT = 'Calibri';     // Word's guaranteed sans

export const BODY_SIZE = 22;            // half-points → 11pt
export const SMALL_SIZE = 17;           // 8.5pt

/** A4 portrait in twips with a 20mm text margin. */
export const A4_PAGE = {
  size: {
    width: convertMillimetersToTwip(210),
    height: convertMillimetersToTwip(297),
  },
  margin: {
    top: convertMillimetersToTwip(20),
    bottom: convertMillimetersToTwip(18),
    left: convertMillimetersToTwip(20),
    right: convertMillimetersToTwip(20),
  },
};

// ─── Paragraph presets ───────────────────────────────────────────────────────

export function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 140, line: 276, lineRule: 'auto' },
    children: [new TextRun({ text, size: BODY_SIZE, color: INK })],
  });
}

export function bulletParagraph(text: string, level = 0): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    bullet: { level },
    spacing: { after: 70, line: 264, lineRule: 'auto' },
    children: [new TextRun({ text, size: BODY_SIZE, color: INK })],
  });
}

export function smallItalic(
  text: string,
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { after: 90 },
    children: [new TextRun({ text, italics: true, size: SMALL_SIZE, color: INK_SOFT })],
  });
}

export function minorHeading(text: string, accent: string): Paragraph {
  return new Paragraph({
    spacing: { before: 180, after: 90 },
    children: [new TextRun({ text, bold: true, size: 24, font: HEAD_FONT, color: shadeHex(accent, 0.1) })],
  });
}

export function spacerParagraph(after = 160): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

// ─── Table borders / cell helpers ────────────────────────────────────────────

const HAIR = (color: string) => ({ style: BorderStyle.SINGLE, size: 4, color });

export function tableBorders(color: string) {
  const b = HAIR(color);
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b };
}

function cell(
  children: Paragraph[],
  opts: { pct?: number; fill?: string; vAlign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable] } = {}
): TableCell {
  return new TableCell({
    children,
    width: opts.pct !== undefined ? { size: opts.pct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    verticalAlign: opts.vAlign ?? VerticalAlignTable.CENTER,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
  });
}

/** Clean data table with an accent-tinted, repeating header row. */
export function dataTable(
  columns: string[],
  rows: string[][],
  accent: string,
  opts: { firstColBold?: boolean } = {}
): Table {
  const pct = Math.floor(100 / Math.max(1, columns.length));
  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map((c) =>
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [new TextRun({ text: c, bold: true, size: 19, font: HEAD_FONT, color: shadeHex(accent, 0.15) })],
          }),
        ],
        { pct, fill: tintHex(accent, 0.9) }
      )
    ),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map(
          (v, i) =>
            cell(
              [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 0, line: 252, lineRule: 'auto' },
                  children: [new TextRun({ text: String(v ?? ''), size: 19, color: INK, bold: Boolean(opts.firstColBold && i === 0) })],
                }),
              ],
              { pct }
            )
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(tintHex(accent, 0.72)),
    rows: [headerRow, ...bodyRows],
  });
}

/** Row of stat chips: bold accent value over a small grey label. */
export function statsTable(stats: { value: string; label: string }[], accent: string): Table {
  const pct = Math.floor(100 / Math.max(1, stats.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(tintHex(accent, 0.72)),
    rows: [
      new TableRow({
        children: stats.map((s) =>
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 20 },
                children: [new TextRun({ text: s.value, bold: true, size: 30, font: HEAD_FONT, color: shadeHex(accent, 0.12) })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
                children: [new TextRun({ text: s.label, size: 16, color: INK_SOFT })],
              }),
            ],
            { pct, fill: tintHex(accent, 0.95) }
          )
        ),
      }),
    ],
  });
}

/** Accent-bar callout box. */
export function calloutTable(text: string, accent: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: HAIR(tintHex(accent, 0.78)),
      bottom: HAIR(tintHex(accent, 0.78)),
      right: HAIR(tintHex(accent, 0.78)),
      left: { style: BorderStyle.SINGLE, size: 18, color: accent },
      insideHorizontal: HAIR('FFFFFF'),
      insideVertical: HAIR('FFFFFF'),
    },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 0, line: 264, lineRule: 'auto' },
                children: [new TextRun({ text, size: 20, color: INK })],
              }),
            ],
            { fill: tintHex(accent, 0.94) }
          ),
        ],
      }),
    ],
  });
}

/** Two-column list pair (e.g. Advantages | Challenges). */
export function twoColTable(
  left: { title: string; items: string[] },
  right: { title: string; items: string[] },
  accent: string
): Table {
  const side = (t: { title: string; items: string[] }): Paragraph[] => [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: t.title || '', bold: true, size: 20, font: HEAD_FONT, color: shadeHex(accent, 0.1) })],
    }),
    ...(t.items || []).map(
      (i) =>
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 50, line: 252, lineRule: 'auto' },
          children: [new TextRun({ text: `— ${i}`, size: 19, color: INK })],
        })
    ),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(tintHex(accent, 0.72)),
    rows: [
      new TableRow({
        children: [
          cell(side(left), { pct: 50, vAlign: VerticalAlignTable.TOP }),
          cell(side(right), { pct: 50, vAlign: VerticalAlignTable.TOP }),
        ],
      }),
    ],
  });
}

/** SWOT 2×2 grid. */
export function swotTable(
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] },
  accent: string
): Table {
  const quad = (title: string, items: string[]): TableCell =>
    cell(
      [
        new Paragraph({
          spacing: { after: 70 },
          children: [new TextRun({ text: title, bold: true, size: 19, font: HEAD_FONT, color: shadeHex(accent, 0.12) })],
        }),
        ...(items || []).map(
          (i) =>
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { after: 40, line: 252, lineRule: 'auto' },
              children: [new TextRun({ text: `— ${i}`, size: 18, color: INK })],
            })
        ),
      ],
      { pct: 50, vAlign: VerticalAlignTable.TOP }
    );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(tintHex(accent, 0.72)),
    rows: [
      new TableRow({ children: [quad('Strengths', swot.strengths), quad('Weaknesses', swot.weaknesses)] }),
      new TableRow({ children: [quad('Opportunities', swot.opportunities), quad('Threats', swot.threats)] }),
    ],
  });
}

/** Key/value profile rows. */
export function kvTable(rows: { k: string; v: string }[], accent: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(tintHex(accent, 0.78)),
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            cell(
              [
                new Paragraph({
                  spacing: { after: 0 },
                  children: [new TextRun({ text: r.k, bold: true, size: 19, font: HEAD_FONT, color: INK })],
                }),
              ],
              { pct: 32 }
            ),
            cell(
              [
                new Paragraph({
                  spacing: { after: 0, line: 252, lineRule: 'auto' },
                  children: [new TextRun({ text: r.v, size: 19, color: INK })],
                }),
              ],
              { pct: 68 }
            ),
          ],
        })
    ),
  });
}

// ─── Chart fallback (text-first: charts become data tables) ─────────────────

export interface ChartLike {
  kind?: 'bar' | 'line' | 'donut';
  title?: string;
  points: { label: string; value: number }[];
  points2?: { label: string; value: number }[];
  seriesLabel?: string;
  seriesLabel2?: string;
}

/**
 * Charts export as a clean data table so the Word document stays fully
 * editable and text-first (the PDF edition carries the visual chart).
 */
export function chartFallback(chart: ChartLike | undefined | null, accent: string): (Paragraph | Table)[] {
  if (!chart?.points?.length) return [];
  const hasSecond = Boolean(chart.points2?.length);
  const columns = ['Series', hasSecond ? chart.seriesLabel || 'Series A' : chart.seriesLabel || 'Value'];
  if (hasSecond) columns.push(chart.seriesLabel2 || 'Series B');
  const rows = chart.points.map((p, i) => {
    const label = p.label || `Point ${i + 1}`;
    const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0');
    return hasSecond
      ? [label, fmt(p.value), fmt(chart.points2?.[i]?.value ?? 0)]
      : [label, fmt(p.value)];
  });
  const out: (Paragraph | Table)[] = [];
  if (chart.title) out.push(smallItalic(`${chart.title} (chart data — see PDF edition for the visual)`));
  out.push(dataTable(columns, rows, accent, { firstColBold: true }));
  out.push(spacerParagraph(120));
  return out;
}

// ─── Brand logo ──────────────────────────────────────────────────────────────

/**
 * Inline brand logo from a data URL, scaled to fit maxW/maxH px (96dpi).
 * Returns null when the brand kit has no (safe) logo.
 */
export function brandImageRun(brand: DocxBrand | undefined, maxW = 140, maxH = 70): ImageRun | null {
  const url = String(brand?.logoDataUrl || '');
  const m = /^data:image\/(png|jpe?g);base64,/i.exec(url);
  if (!m || url.length > 600_000) return null;
  // Word raster formats only — webp is silently skipped.
  const type = m[1].toLowerCase() === 'png' ? ('png' as const) : ('jpg' as const);

  let w = Number(brand?.logoWidth) || 0;
  let h = Number(brand?.logoHeight) || 0;
  if (!w || !h) {
    w = 140;
    h = 56;
  }
  const scale = Math.min(1, maxW / w, maxH / h);
  return new ImageRun({
    type,
    data: url,
    transformation: { width: Math.max(8, Math.round(w * scale)), height: Math.max(8, Math.round(h * scale)) },
  });
}

// ─── Header / footer ─────────────────────────────────────────────────────────

export function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: ['Page ', PageNumber.CURRENT], size: 16, color: GRAY, font: HEAD_FONT }),
          new TextRun({ children: [' of ', PageNumber.TOTAL_PAGES], size: 16, color: GRAY, font: HEAD_FONT }),
        ],
      }),
    ],
  });
}

export function contentHeader(label: string, accent: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: tintHex(accent, 0.75) } },
        children: [new TextRun({ text: label, size: 15, color: GRAY, font: HEAD_FONT })],
      }),
    ],
  });
}

export function emptyHeaderFooter(): { header: Header; footer: Footer } {
  return { header: new Header({ children: [] }), footer: new Footer({ children: [] }) };
}

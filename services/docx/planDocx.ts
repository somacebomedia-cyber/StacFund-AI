// services/docx/planDocx.ts
/**
 * StacFund — Business plan → Word (.docx) builder
 * ================================================
 * Converts the typed PlanDocument into a real, fully editable Word document:
 * true Heading 1/2 styles (Word's navigation pane works), a live Table of
 * Contents field, repeating table headers, page-of-total footers, and the
 * brand logo on the cover. Text-first and sober, matching the PDF edition.
 *
 * Charts export as data tables — a Word document is for editing, and an
 * embedded chart image would not be editable or consistent with the
 * text-first design contract.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TextRun,
  TableOfContents,
} from 'docx';
import type { PlanBlock, PlanDocument } from '../businessPlan/planSchema';
import {
  A4_PAGE,
  BODY_FONT,
  BODY_SIZE,
  DocxBrand,
  HEAD_FONT,
  bodyParagraph,
  brandImageRun,
  bulletParagraph,
  calloutTable,
  chartFallback,
  contentHeader,
  dataTable,
  emptyHeaderFooter,
  hex6,
  kvTable,
  minorHeading,
  pageFooter,
  smallItalic,
  spacerParagraph,
  statsTable,
  swotTable,
  twoColTable,
} from './docxShared';

const DEFAULT_ACCENT = '1F3A5F';
const INK = '2A2F36';
const INK_SOFT = '6B7280';

/** Renders one content block into DOCX children. */
function blockChildren(b: PlanBlock, accent: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  switch (b.type) {
    case 'paragraph':
      if (b.text) out.push(bodyParagraph(b.text));
      break;
    case 'heading':
      if (b.text) out.push(minorHeading(b.text, accent));
      break;
    case 'bullets':
      if (b.title) out.push(minorHeading(b.title, accent));
      (b.items || []).forEach((i) => out.push(bulletParagraph(i)));
      break;
    case 'sources':
      (b.items || []).forEach((i) => out.push(smallItalic(i)));
      out.push(spacerParagraph(60));
      break;
    case 'twoCol':
      if (b.left || b.right) {
        out.push(
          twoColTable(
            b.left || { title: '', items: [] },
            b.right || { title: '', items: [] },
            accent
          )
        );
        out.push(spacerParagraph(120));
      }
      break;
    case 'stats':
      if (b.stats?.length) {
        out.push(statsTable(b.stats.slice(0, 4), accent));
        out.push(spacerParagraph(120));
      }
      break;
    case 'table':
      if (b.table?.columns?.length && b.table.rows?.length) {
        if (b.table.caption) out.push(smallItalic(b.table.caption));
        out.push(dataTable(b.table.columns, b.table.rows, accent, { firstColBold: true }));
        out.push(spacerParagraph(120));
      }
      break;
    case 'swot':
      if (b.swot) {
        out.push(swotTable(b.swot, accent));
        out.push(spacerParagraph(120));
      }
      break;
    case 'kv':
      if (b.kv?.rows?.length) {
        if (b.kv.title) out.push(minorHeading(b.kv.title, accent));
        out.push(kvTable(b.kv.rows, accent));
        out.push(spacerParagraph(120));
      }
      break;
    case 'chart':
      out.push(...chartFallback(b.chart, accent));
      break;
    case 'callout':
      if (b.text) {
        out.push(calloutTable(b.text, accent));
        out.push(spacerParagraph(120));
      }
      break;
  }
  return out;
}

/** Cover page children. */
function coverChildren(plan: PlanDocument, brand: DocxBrand | undefined, accent: string): (Paragraph | Table)[] {
  const meta = plan.meta;
  const out: (Paragraph | Table)[] = [];

  const logo = brandImageRun(brand, 150, 72);
  if (logo) {
    out.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 260 }, children: [logo] }));
  }

  out.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: (meta.planTitle || 'Business Plan').toUpperCase(),
          bold: true,
          size: 20,
          font: HEAD_FONT,
          color: accent,
        }),
      ],
    })
  );
  out.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: meta.businessName || 'Your Business', bold: true, size: 52, font: BODY_FONT, color: INK })],
    })
  );
  if (meta.tagline) {
    out.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: meta.tagline, italics: true, size: 26, font: BODY_FONT, color: INK_SOFT })],
      })
    );
  }
  out.push(spacerParagraph(220));

  const kv: { k: string; v: string }[] = [];
  if (meta.preparedFor) kv.push({ k: 'Prepared for', v: meta.preparedFor });
  if (meta.preparedBy) kv.push({ k: 'Prepared by', v: meta.preparedBy });
  if (meta.requestedAmountLabel) kv.push({ k: 'Funding requested', v: meta.requestedAmountLabel });
  if (meta.dateLabel) kv.push({ k: 'Date', v: meta.dateLabel });
  if (kv.length) {
    out.push(kvTable(kv, accent));
    out.push(spacerParagraph(160));
  }

  const contact = [meta.contactEmail, meta.contactPhone, meta.contactWebsite, meta.contactAddress].filter(Boolean).join('  ·  ');
  if (contact) out.push(smallItalic(contact));
  if (meta.preparedFor) {
    out.push(
      new Paragraph({
        spacing: { before: 60 },
        children: [new TextRun({ text: `Submitted to ${meta.preparedFor}`, italics: true, size: 18, color: INK_SOFT })],
      })
    );
  }

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

/**
 * Builds the full Word document for a business plan.
 * `plan` may come straight from the client (JSON) — it is only read.
 */
export function buildPlanDocx(plan: PlanDocument, brand?: DocxBrand): Document {
  const accent = hex6(brand?.accentColor, DEFAULT_ACCENT);
  const brandName = brand?.businessName || plan.meta.businessName || 'Business';
  const headerLabel = `${brandName} — ${plan.meta.planTitle || 'Business Plan'}`;

  const children: (Paragraph | Table | TableOfContents)[] = [];
  children.push(...coverChildren(plan, brand, accent));

  // Table of contents (a live Word field — page numbers populate on open).
  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32, font: HEAD_FONT, color: INK })],
    }),
    new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({
      spacing: { before: 120, after: 0 },
      children: [new TextRun({ text: 'Page numbers refresh automatically when this document is opened in Microsoft Word (say Yes if prompted to update fields).', italics: true, size: 15, color: '9AA1A9' })],
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // Chapters
  for (const chapter of plan.chapters || []) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: `${chapter.number}. ${chapter.title}`, bold: true, size: 32, font: HEAD_FONT, color: accent })],
      })
    );
    if (chapter.summary) {
      children.push(
        new Paragraph({
          spacing: { after: 220 },
          children: [new TextRun({ text: chapter.summary, italics: true, size: 21, color: INK_SOFT })],
        })
      );
    }
    chapter.subsections.forEach((sub, i) => {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: `${chapter.number}.${i + 1}  ${sub.title}`, bold: true, size: 25, font: HEAD_FONT, color: '2A2F36' })],
        })
      );
      for (const b of sub.blocks || []) children.push(...blockChildren(b, accent));
    });
  }

  return new Document({
    creator: 'StacFund AI',
    title: `${plan.meta.businessName} — ${plan.meta.planTitle || 'Business Plan'}`,
    description: plan.meta.tagline || undefined,
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: BODY_FONT, size: BODY_SIZE, color: INK } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: HEAD_FONT, size: 32, bold: true, color: accent },
          paragraph: { spacing: { before: 240, after: 140 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: HEAD_FONT, size: 25, bold: true, color: INK },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      ],
    },
    sections: [
      {
        properties: { page: A4_PAGE, titlePage: true },
        headers: { default: contentHeader(headerLabel, accent), first: emptyHeaderFooter().header },
        footers: { default: pageFooter(), first: emptyHeaderFooter().footer },
        children,
      },
    ],
  });
}

/** Serialises the document to a .docx buffer. */
export async function planDocxBuffer(plan: PlanDocument, brand?: DocxBrand): Promise<Buffer> {
  return Packer.toBuffer(buildPlanDocx(plan, brand));
}

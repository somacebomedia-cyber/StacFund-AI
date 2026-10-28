// services/docx/proposalDocx.ts
/**
 * StacFund — Funding proposal → Word (.docx) builder
 * ===================================================
 * The Proposal Studio's Word export. Same sober design language as the plan
 * exporter: serif body, sans headings, one accent, stat chips and tables —
 * plus the brand logo on the cover.
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
} from 'docx';
import type { ProposalDocument } from '../proposal/proposalSchema';
import { activeSections } from '../proposal/proposalSchema';
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
  contentHeader,
  dataTable,
  emptyHeaderFooter,
  hex6,
  kvTable,
  pageFooter,
  smallItalic,
  spacerParagraph,
  statsTable,
} from './docxShared';

const DEFAULT_ACCENT = '1F3A5F';
const INK = '2A2F36';
const INK_SOFT = '6B7280';

function coverChildren(doc: ProposalDocument, brand: DocxBrand | undefined, accent: string): (Paragraph | Table)[] {
  const meta = doc.meta;
  const out: (Paragraph | Table)[] = [];

  const logo = brandImageRun(brand, 150, 72);
  if (logo) {
    out.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 240 }, children: [logo] }));
  }

  out.push(
    new Paragraph({
      spacing: { after: 140 },
      children: [new TextRun({ text: 'FUNDING PROPOSAL', bold: true, size: 20, font: HEAD_FONT, color: accent })],
    }),
    new Paragraph({
      spacing: { after: 110 },
      children: [new TextRun({ text: meta.businessName || 'Your Business', bold: true, size: 50, font: BODY_FONT, color: INK })],
    })
  );
  if (meta.tagline) {
    out.push(
      new Paragraph({
        spacing: { after: 220 },
        children: [new TextRun({ text: meta.tagline, italics: true, size: 25, color: INK_SOFT })],
      })
    );
  }
  out.push(spacerParagraph(180));

  const kv: { k: string; v: string }[] = [];
  if (meta.preparedFor) kv.push({ k: 'Prepared for', v: meta.preparedFor });
  if (meta.preparedBy) kv.push({ k: 'Prepared by', v: meta.preparedBy });
  if (meta.requestedAmountLabel) kv.push({ k: 'Funding requested', v: meta.requestedAmountLabel });
  if (meta.dateLabel) kv.push({ k: 'Date', v: meta.dateLabel });
  if (kv.length) {
    out.push(kvTable(kv, accent));
    out.push(spacerParagraph(140));
  }
  if (meta.contactLine) out.push(smallItalic(meta.contactLine));

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

/** Builds the full Word document for a funding proposal. */
export function buildProposalDocx(doc: ProposalDocument, brand?: DocxBrand): Document {
  const accent = hex6(brand?.accentColor, DEFAULT_ACCENT);
  const brandName = brand?.businessName || doc.meta.businessName || 'Business';
  const headerLabel = `${brandName} — Funding Proposal`;
  const sections = activeSections(doc);

  const children: (Paragraph | Table)[] = [];
  children.push(...coverChildren(doc, brand, accent));

  sections.forEach((s, idx) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: idx > 0,
        spacing: { before: idx === 0 ? 0 : 120, after: 120 },
        children: [new TextRun({ text: `${idx + 1}. ${s.title}`, bold: true, size: 30, font: HEAD_FONT, color: accent })],
      })
    );
    (s.paragraphs || []).forEach((p) => children.push(bodyParagraph(p)));
    if (s.bullets?.length) {
      children.push(spacerParagraph(40));
      s.bullets.forEach((b) => children.push(bulletParagraph(b)));
    }
    if (s.stats?.length) {
      children.push(spacerParagraph(80));
      children.push(statsTable(s.stats.slice(0, 4), accent));
      children.push(spacerParagraph(100));
    }
    if (s.table?.columns?.length && s.table.rows?.length) {
      if (s.table.caption) children.push(smallItalic(s.table.caption));
      children.push(dataTable(s.table.columns, s.table.rows, accent, { firstColBold: true }));
      children.push(spacerParagraph(100));
    }
  });

  // Closing
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 90 },
      children: [new TextRun({ text: 'Thank you for considering this proposal.', bold: true, size: 26, font: BODY_FONT, color: INK })],
    }),
    bodyParagraph(
      `We welcome the opportunity to discuss this submission in more detail and to provide any additional information the review committee may require. ${doc.meta.contactLine ? `Please direct all correspondence to ${doc.meta.contactLine}.` : ''}`.trim()
    ),
    calloutTable(
      `${doc.meta.businessName || 'This business'}${doc.meta.requestedAmountLabel ? ` requests ${doc.meta.requestedAmountLabel}` : ' seeks funding'} — submitted with confidence in the plan set out above.`,
      accent
    )
  );

  return new Document({
    creator: 'StacFund AI',
    title: `${doc.meta.businessName} — Funding Proposal`,
    description: doc.meta.tagline || undefined,
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
          run: { font: HEAD_FONT, size: 30, bold: true, color: accent },
          paragraph: { spacing: { before: 260, after: 130 } },
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
export async function proposalDocxBuffer(doc: ProposalDocument, brand?: DocxBrand): Promise<Buffer> {
  return Packer.toBuffer(buildProposalDocx(doc, brand));
}

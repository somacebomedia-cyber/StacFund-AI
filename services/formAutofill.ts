// services/formAutofill.ts
/**
 * Fills an OFFICIAL funder PDF from the applicant's own answers.
 *
 * Runs entirely in the browser with pdf-lib. No answer, ID number or address is
 * sent to a server or to an AI. The model is only ever used (elsewhere) to READ a
 * blank form once; the filling here is plain code, so nothing can be invented.
 *
 * How it works:
 *   - A FormTemplate describes one specific form: where each answer is drawn
 *     (DrawOp), which questions the wizard asks, how to prefill from the profile,
 *     and what must be checked before the PDF can be produced.
 *   - fillFormPdf() loads the official PDF, draws the answers on top of it, and
 *     reports any answer that had to be cut short so the applicant can fix it.
 *
 * The engine never signs, dates or accepts a declaration on the applicant's behalf.
 * Templates must leave those boxes alone (see FormTemplate.neverFilled).
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { conditionHolds, stripTrailingCents } from './formModel';
import type { AnswerMap, FormTemplate, ValueFormat } from './formModel';

export * from './formModel';

// ─── Value formatting ────────────────────────────────────────────────────────

/** "120000" -> "120 000". Whole rand only: a pasted decimal part is dropped, never glued on as extra digits. */
export function groupDigits(raw: string): string {
  const digits = stripTrailingCents(raw).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatValue(raw: string, format: ValueFormat = 'text'): string {
  const value = raw.trim();
  if (!value) return '';
  switch (format) {
    case 'amount': {
      const g = groupDigits(value);
      return g;
    }
    case 'money': {
      const g = groupDigits(value);
      return g ? `R${g}` : '';
    }
    case 'percent': {
      const digits = value.replace(/[^\d.]/g, '');
      return digits ? `${digits}%` : '';
    }
    default:
      return value;
  }
}

/** Keeps only characters the PDF's standard font can draw, so saving never fails. */
export function sanitizeForFont(font: PDFFont, text: string): string {
  const allowed = new Set(font.getCharacterSet());
  const tidy = text
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\t]+/g, ' ');
  let out = '';
  for (const ch of tidy) {
    const code = ch.codePointAt(0) ?? 63;
    out += ch === '\n' || allowed.has(code) ? ch : '?';
  }
  return out;
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

interface Fitted {
  text: string;
  size: number;
  cut: boolean;
}

/** Shrinks text to fit one line; if it still does not fit at the smallest size it is cut with "..." and flagged. */
export function fitOneLine(font: PDFFont, text: string, maxWidth: number, size: number, minSize: number): Fitted {
  const floor = Math.min(minSize, size);
  let s = size;
  while (s > floor && font.widthOfTextAtSize(text, s) > maxWidth) s = Math.max(floor, s - 0.25);
  if (font.widthOfTextAtSize(text, s) <= maxWidth) return { text, size: s, cut: false };
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, s) > maxWidth) t = t.slice(0, -1);
  return { text: `${t}...`, size: s, cut: true };
}

export function wrapLines(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // a single very long word is broken by characters
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const INK = rgb(0, 0, 0);

/** SVG path for a rounded rectangle whose top-left corner is the origin. */
export function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

function yFromTop(page: PDFPage, top: number): number {
  return page.getHeight() - top;
}

// ─── The engine ──────────────────────────────────────────────────────────────

export interface FillResult {
  bytes: Uint8Array;
  /** Keys of answers that did not fit their box and were shortened. */
  cutKeys: string[];
}

export async function fillFormPdf(
  template: FormTemplate,
  formBytes: ArrayBuffer | Uint8Array,
  answers: AnswerMap
): Promise<FillResult> {
  // A password-protected or damaged PDF gets a plain-language error, not pdf-lib's.
  let pdf;
  try {
    pdf = await PDFDocument.load(formBytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) {
      throw new Error('The official form PDF is password-protected, so it cannot be filled here. Please tell support so it can be replaced.');
    }
    throw new Error('The official form PDF could not be opened. Please tell support so it can be replaced.');
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  if (pages.length === 0) throw new Error('The official form PDF has no pages. Please tell support so it can be replaced.');
  const data: AnswerMap = { ...answers, ...(template.computed ? template.computed(answers) : {}) };
  const cutKeys: string[] = [];

  for (const op of template.ops) {
    const page = pages[op.page];
    if (!page) continue;

    if (op.kind === 'text') {
      if (!conditionHolds(op.when, data)) continue;
      const value = sanitizeForFont(font, formatValue(data[op.key] ?? '', op.format));
      if (!value) continue;
      const fitted = fitOneLine(font, value.replace(/\s+/g, ' '), op.maxWidth, op.size ?? 9.5, op.minSize ?? 6.5);
      if (fitted.cut) cutKeys.push(op.key);
      page.drawText(fitted.text, { x: op.x, y: yFromTop(page, op.baseline), size: fitted.size, font, color: INK });
    } else if (op.kind === 'wrap') {
      const value = sanitizeForFont(font, (data[op.key] ?? '').trim());
      if (!value) continue;
      let size = op.size ?? 9;
      const minSize = op.minSize ?? 6.5;
      let lines = wrapLines(font, value, size, op.width);
      while (lines.length * size * 1.22 > op.height && size > minSize) {
        size = Math.max(minSize, size - 0.5);
        lines = wrapLines(font, value, size, op.width);
      }
      const lineHeight = size * 1.22;
      const maxLines = Math.max(1, Math.floor(op.height / lineHeight));
      if (lines.length > maxLines) {
        cutKeys.push(op.key);
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}...`;
      }
      lines.forEach((line, i) => {
        page.drawText(line, { x: op.x, y: yFromTop(page, op.top + size + i * lineHeight), size, font, color: INK });
      });
    } else if (op.kind === 'tick') {
      if (!conditionHolds(op.when, data) || (data[op.key] ?? '') !== op.equals) continue;
      const { x0, top, x1, bottom } = op.rect;
      const pad = 1.4;
      page.drawLine({ start: { x: x0 + pad, y: yFromTop(page, top + pad) }, end: { x: x1 - pad, y: yFromTop(page, bottom - pad) }, thickness: 1.3, color: INK });
      page.drawLine({ start: { x: x0 + pad, y: yFromTop(page, bottom - pad) }, end: { x: x1 - pad, y: yFromTop(page, top + pad) }, thickness: 1.3, color: INK });
    } else if (op.kind === 'circle') {
      if ((data[op.key] ?? '') !== op.equals) continue;
      // A rounded outline around the printed label (it never crosses the text or the cell border).
      const { x0, top, x1, bottom } = op.rect;
      const padX = 4;
      const padY = 3;
      const w = x1 - x0 + padX * 2;
      const h = bottom - top + padY * 2;
      page.drawSvgPath(roundedRectPath(w, h, Math.min(7, h / 2)), {
        x: x0 - padX,
        y: yFromTop(page, top - padY),
        borderColor: INK,
        borderWidth: 1.2,
      });
    }
  }

  return { bytes: await pdf.save(), cutKeys };
}

/** True when the bytes look like a real PDF (a SPA fallback page would not). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}


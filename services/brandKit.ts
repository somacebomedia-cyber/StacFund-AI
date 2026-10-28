// services/brandKit.ts
/**
 * StacFund — Brand Kit (logo + accent + tagline, per user)
 * ========================================================
 * One small Firestore doc per user (users/{uid}/brand_kit/main) holding the
 * business's branding essentials. Applied automatically to:
 *
 *   - Business Plan Studio covers (logo + accent theme + tagline)
 *   - Proposal Studio covers (logo + accent default)
 *   - PDF exports (the logo is part of the rendered pages)
 *   - DOCX exports (logo on the cover, accent on headings/tables)
 *
 * The logo is stored as a data URL, downscaled client-side to ≤480px so the
 * doc stays far below Firestore's 1MB limit. Width/height are stored with it
 * so the Word exporter can preserve the aspect ratio.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface BrandKit {
  businessName: string;
  tagline: string;
  /** data:image/png;base64,… — empty string when no logo. */
  logoDataUrl: string;
  /** Logo pixel dimensions (for aspect-correct Word embedding). */
  logoWidth: number;
  logoHeight: number;
  /** Hex accent, e.g. #1F3A5F — empty string when unset. */
  accentColor: string;
  updatedAt: number;
}

export const BRAND_ACCENT_PRESETS: { hex: string; name: string }[] = [
  { hex: '#1F3A5F', name: 'Institutional Navy' },
  { hex: '#0F6B4F', name: 'Fiscal Green' },
  { hex: '#7A2E2E', name: 'Boardroom Maroon' },
  { hex: '#37474F', name: 'Neutral Slate' },
  { hex: '#B45309', name: 'Amber Earth' },
  { hex: '#16652D', name: 'Protea Green' },
];

export function emptyBrandKit(): BrandKit {
  return {
    businessName: '',
    tagline: '',
    logoDataUrl: '',
    logoWidth: 0,
    logoHeight: 0,
    accentColor: '',
    updatedAt: 0,
  };
}

/** Normalises user hex input to #RRGGBB (uppercase). Accepts #RGB shorthand. */
export function normalizeHexColor(input: string): string | null {
  const raw = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('').toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return null;
}

/** A data URL that is safe to persist and re-render (image, sane size). */
export function isSafeLogoDataUrl(value: string): boolean {
  if (typeof value !== 'string' || !value.startsWith('data:image/')) return false;
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) return false;
  // ~375KB decoded ceiling — comfortably inside Firestore's 1MB doc limit.
  return value.length > 0 && value.length < 500_000;
}

export async function loadBrandKit(userId: string): Promise<BrandKit | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'brand_kit', 'main'));
    if (!snap.exists()) return null;
    const raw = snap.data() as Partial<BrandKit>;
    const kit: BrandKit = {
      businessName: typeof raw.businessName === 'string' ? raw.businessName : '',
      tagline: typeof raw.tagline === 'string' ? raw.tagline : '',
      logoDataUrl: isSafeLogoDataUrl(String(raw.logoDataUrl || '')) ? String(raw.logoDataUrl) : '',
      logoWidth: Number(raw.logoWidth) || 0,
      logoHeight: Number(raw.logoHeight) || 0,
      accentColor: normalizeHexColor(String(raw.accentColor || '')) || '',
      updatedAt: Number(raw.updatedAt) || 0,
    };
    return kit;
  } catch (e) {
    console.warn('[brandKit] load failed', e);
    return null;
  }
}

export async function saveBrandKit(userId: string, kit: BrandKit): Promise<BrandKit> {
  const clean: BrandKit = {
    businessName: String(kit.businessName || '').slice(0, 120),
    tagline: String(kit.tagline || '').slice(0, 200),
    logoDataUrl: isSafeLogoDataUrl(kit.logoDataUrl) ? kit.logoDataUrl : '',
    logoWidth: Number(kit.logoWidth) || 0,
    logoHeight: Number(kit.logoHeight) || 0,
    accentColor: normalizeHexColor(kit.accentColor) || '',
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, 'users', userId, 'brand_kit', 'main'), clean);
  return clean;
}

export async function deleteBrandKitLogo(userId: string): Promise<void> {
  await setDoc(
    doc(db, 'users', userId, 'brand_kit', 'main'),
    { logoDataUrl: '', logoWidth: 0, logoHeight: 0, updatedAt: Date.now() },
    { merge: true }
  );
}

/**
 * Downscales an uploaded image file to a PNG data URL within maxDim square.
 * Browser-only (canvas). Rejects non-images and files that are too large.
 */
export async function resizeImageFileToDataUrl(
  file: File,
  maxDim = 480
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file (PNG or JPG).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('That image is too large — please use one under 8MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image file.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process that image.');
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    if (!isSafeLogoDataUrl(dataUrl)) {
      throw new Error('That logo is too complex to store — try a simpler or smaller image.');
    }
    return { dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

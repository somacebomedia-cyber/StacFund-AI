// components/BrandKitPanel.tsx
/**
 * StacFund — Brand Kit panel (logo · accent · tagline)
 * =====================================================
 * One place for the user's branding. Everything saved here is applied
 * automatically to business-plan and proposal covers, PDF exports and Word
 * exports — no per-document setup.
 *
 * Storage: users/{uid}/brand_kit/main (see services/brandKit.ts).
 * The logo is downscaled client-side to ≤480px PNG before it is stored, so
 * the doc stays far below Firestore's 1MB limit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Palette, Loader2, CheckCircle2, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import {
  BRAND_ACCENT_PRESETS,
  emptyBrandKit,
  loadBrandKit,
  normalizeHexColor,
  resizeImageFileToDataUrl,
  saveBrandKit,
  type BrandKit,
} from '../services/brandKit';
import type { User } from '../types';

interface BrandKitPanelProps {
  user: User | null;
}

const BrandKitPanel: React.FC<BrandKitPanelProps> = ({ user }) => {
  const [kit, setKit] = useState<BrandKit>(emptyBrandKit());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accentInput, setAccentInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const loaded = await loadBrandKit(user.id);
      if (cancelled) return;
      if (loaded) {
        setKit(loaded);
        setAccentInput(loaded.accentColor ? loaded.accentColor.replace('#', '') : '');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  };

  const persist = async (next: BrandKit) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const clean = await saveBrandKit(user.id, next);
      setKit(clean);
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your brand kit.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoPick = async (file: File | undefined) => {
    if (!file || !user) return;
    setError(null);
    try {
      const { dataUrl, width, height } = await resizeImageFileToDataUrl(file);
      await persist({ ...kit, logoDataUrl: dataUrl, logoWidth: width, logoHeight: height });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process that image.');
    }
  };

  const removeLogo = async () => {
    if (!user) return;
    await persist({ ...kit, logoDataUrl: '', logoWidth: 0, logoHeight: 0 });
  };

  const applyAccent = async (hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) {
      setError('That is not a valid colour hex (try #1F3A5F).');
      return;
    }
    setError(null);
    setAccentInput(normalized.replace('#', ''));
    await persist({ ...kit, accentColor: normalized });
  };

  if (!user) return null;

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Palette size={18} className="text-emerald-400" />
        <h3 className="text-base font-bold">Brand Kit</h3>
        {saved && (
          <span className="ml-auto text-xs text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 size={12} /> Saved
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 -mt-3 mb-4">
        Your logo and accent colour are applied automatically to business plans, funding proposals, and their PDF and Word exports.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 size={15} className="animate-spin" /> Loading your brand kit…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Logo */}
          <div className="rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 font-bold text-sm mb-2">
              <ImageIcon size={14} className="text-emerald-400" /> Logo
            </div>
            <p className="text-xs text-gray-400 mb-3">
              PNG or JPG. We downscale it automatically — square or horizontal logos look best on covers.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-28 h-20 rounded-lg border border-white/10 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                {kit.logoDataUrl ? (
                  <img src={kit.logoDataUrl} alt="Brand logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-[10px] text-gray-400">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition disabled:opacity-40"
                >
                  <Upload size={13} /> {kit.logoDataUrl ? 'Replace' : 'Upload logo'}
                </button>
                {kit.logoDataUrl && (
                  <button
                    onClick={removeLogo}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-red-300 transition disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                void handleLogoPick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {/* Accent colour */}
          <div className="rounded-xl border border-white/10 p-4">
            <div className="font-bold text-sm mb-2">Accent colour</div>
            <p className="text-xs text-gray-400 mb-3">Used for headings, rules and table headers in your documents.</p>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {BRAND_ACCENT_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  title={p.name}
                  onClick={() => void applyAccent(p.hex)}
                  disabled={saving}
                  className={`w-8 h-8 rounded-lg border-2 transition ${
                    kit.accentColor.toUpperCase() === p.hex ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                  }`}
                  style={{ background: p.hex }}
                />
              ))}
              {kit.accentColor && (
                <button
                  onClick={() => void persist({ ...kit, accentColor: '' })}
                  disabled={saving}
                  className="text-[11px] font-semibold text-gray-400 hover:text-red-300 transition ml-1"
                >
                  clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono">#</span>
              <input
                value={accentInput}
                onChange={(e) => setAccentInput(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
                onBlur={() => {
                  if (accentInput.trim() && normalizeHexColor(accentInput) !== kit.accentColor) {
                    void applyAccent(accentInput);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && accentInput.trim()) void applyAccent(accentInput);
                }}
                placeholder="1F3A5F"
                disabled={saving}
                className="w-28 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs font-mono"
              />
              <button
                onClick={() => void applyAccent(accentInput)}
                disabled={saving || !accentInput.trim()}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Name + tagline */}
          <div className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="font-bold text-sm">Cover details</div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Trading name on documents</label>
              <input
                value={kit.businessName}
                onChange={(e) => setKit({ ...kit, businessName: e.target.value })}
                onBlur={() => void persist(kit)}
                placeholder="e.g. Nawi-Learn Toddler Centre"
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Default tagline</label>
              <input
                value={kit.tagline}
                onChange={(e) => setKit({ ...kit, tagline: e.target.value })}
                onBlur={() => void persist(kit)}
                placeholder="One line under the title on covers"
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-500">
              Saved automatically when you click out of a field. Studios prefill from these values.
            </p>
          </div>

          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
          {saving && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Saving…
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BrandKitPanel;

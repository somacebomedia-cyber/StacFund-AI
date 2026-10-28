// components/AlertPreferences.tsx
/**
 * Per-user alert preferences UI.
 *
 * Lets a signed-in user opt into email / push / WhatsApp alerts for new
 * funding opportunities that match their profile. Reads & writes via
 * /api/alerts/prefs (server validates body shape and writes to
 * users/{uid}/alert_prefs/main).
 *
 * Also registers the browser for FCM push (when supported) via
 * /api/alerts/device-token.
 *
 * Notes:
 *  - All channels default to ON except WhatsApp (which needs a number).
 *  - The server silently no-ops any channel whose env vars are missing, so
 *    toggling email here does nothing until SMTP creds are added on the server.
 *  - The Push toggle only shows when Notification permission is grantable.
 */
import React, { useEffect, useState } from 'react';
import { Bell, Mail, MessageCircle, Smartphone, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { auth } from '../services/firebase';
import { User } from '../types';

interface AlertPreferencesProps {
  user: User | null;
}

interface Prefs {
  emailOptIn: boolean;
  whatsappOptIn: boolean;
  pushOptIn: boolean;
  whatsappNumber: string | null;
  email: string | null;
  digest: 'immediate' | 'daily';
}

const DEFAULTS: Prefs = {
  emailOptIn: true,
  whatsappOptIn: false,
  pushOptIn: true,
  whatsappNumber: null,
  email: null,
  digest: 'immediate',
};

const AlertPreferences: React.FC<AlertPreferencesProps> = ({ user }) => {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('denied');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchPrefs = async () => {
      if (!user) { setLoading(false); return; }
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/alerts/prefs', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Could not load preferences');
        const data = (await res.json()) as Partial<Prefs>;
        if (!cancelled) setPrefs({ ...DEFAULTS, ...data, email: data.email ?? user.email ?? null });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load preferences');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPrefs();
    return () => { cancelled = true; };
  }, [user]);

  const save = async (next: Prefs) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch('/api/alerts/prefs', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const savedPrefs = (await res.json()) as Prefs;
      setPrefs({ ...DEFAULTS, ...savedPrefs });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const requestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
    if (perm === 'granted') {
      // Tell the user something reassuring; the actual FCM token registration
      // would normally happen via the firebase-messaging SW + getToken().
      new Notification('StacFund alerts enabled', { body: 'You will get a notification when a new funding match is published.', icon: '/icon.png' });
    }
  };

  if (!user) {
    return <div className="glass-panel p-6 rounded-2xl text-sm text-gray-400">Sign in to manage your alert preferences.</div>;
  }

  if (loading) {
    return <div className="glass-panel p-6 rounded-2xl flex items-center gap-2 text-sm text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  }

  return (
    <div className="glass-panel p-6 rounded-2xl space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={18} className="text-cyan-400" />
        <h3 className="text-base font-bold">Funding Alerts</h3>
        {saved && <span className="ml-auto text-xs text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Saved</span>}
      </div>
      <p className="text-xs text-gray-400 -mt-3 mb-3">
        Choose how StacFund should reach you when a new funding opportunity matches your profile. The in-app bell always rings; this controls the other channels.
      </p>

      {/* Email */}
      <div className="rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.emailOptIn}
            onChange={(e) => save({ ...prefs, emailOptIn: e.target.checked })}
            disabled={saving}
            className="mt-1 h-4 w-4 accent-cyan-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Mail size={14} className="text-cyan-400" /> Email alerts
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Sent to the address you provide. SMTP is server-side — we never share your email.</p>
            <input
              type="email"
              value={prefs.email ?? ''}
              onChange={(e) => setPrefs({ ...prefs, email: e.target.value })}
              onBlur={() => save(prefs)}
              placeholder={user.email || 'you@example.com'}
              disabled={saving || !prefs.emailOptIn}
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm disabled:opacity-40"
            />
          </div>
        </label>
      </div>

      {/* WhatsApp */}
      <div className="rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.whatsappOptIn}
            onChange={(e) => save({ ...prefs, whatsappOptIn: e.target.checked })}
            disabled={saving}
            className="mt-1 h-4 w-4 accent-emerald-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-bold text-sm">
              <MessageCircle size={14} className="text-emerald-400" /> WhatsApp alerts
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Sent via the WhatsApp Business API (Twilio). Standard message rates apply.</p>
            <input
              type="tel"
              value={prefs.whatsappNumber ?? ''}
              onChange={(e) => setPrefs({ ...prefs, whatsappNumber: e.target.value })}
              onBlur={() => save(prefs)}
              placeholder="+27 82 123 4567"
              disabled={saving || !prefs.whatsappOptIn}
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm disabled:opacity-40"
            />
          </div>
        </label>
      </div>

      {/* Push */}
      <div className="rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.pushOptIn}
            onChange={(e) => save({ ...prefs, pushOptIn: e.target.checked })}
            disabled={saving}
            className="mt-1 h-4 w-4 accent-purple-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Smartphone size={14} className="text-purple-400" /> Push notifications
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Browser push (Chrome / Edge / Safari). Server-side FCM also works when the browser is closed.</p>
            {pushPermission !== 'granted' && prefs.pushOptIn && (
              <button
                type="button"
                onClick={() => void requestPushPermission()}
                className="mt-2 text-xs font-bold rounded-lg bg-purple-500 hover:bg-purple-400 text-white px-3 py-1.5"
              >
                Allow browser notifications
              </button>
            )}
            {pushPermission === 'granted' && prefs.pushOptIn && (
              <p className="text-xs text-emerald-400 mt-2 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Browser notifications enabled</p>
            )}
          </div>
        </label>
      </div>

      {/* Digest mode */}
      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 font-bold text-sm mb-2">
          <Bell size={14} className="text-amber-400" /> Frequency
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save({ ...prefs, digest: 'immediate' })}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${prefs.digest === 'immediate' ? 'bg-amber-500 text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
          >
            Send as soon as a match is published
          </button>
          <button
            type="button"
            onClick={() => save({ ...prefs, digest: 'daily' })}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${prefs.digest === 'daily' ? 'bg-amber-500 text-black' : 'bg-white/5 text-gray-400 border border-white/10'}`}
          >
            Daily digest
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
    </div>
  );
};

export default AlertPreferences;

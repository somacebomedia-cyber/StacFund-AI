// components/AIGatewayPanel.tsx
/**
 * AI Gateway Admin Panel
 *
 * Live view of the multi-provider AI gateway:
 *   - Provider status (healthy / degraded / unhealthy / disabled)
 *   - Per-provider model + capabilities
 *   - Current user's usage (requests + tokens vs limits)
 *   - "Probe now" button to actively ping all providers (admin-only)
 *
 * Intended for the Dashboard or a dedicated admin tab. Read-only by default;
 * the probe button requires the STACFUND_ADMIN_SECRET env var on the server.
 *
 * Styling: matches the existing dark glassmorphism aesthetic.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  getHealth,
  getUsage,
  getConfig,
  probeHealth,
  AIGatewayClientError,
  type ProviderHealthSnapshot,
  type UserUsageSnapshot,
} from '../services/aiGatewayClient';

interface AIGatewayPanelProps {
  /** Optional admin secret — if provided, the "Probe now" button is shown. */
  adminSecret?: string;
  /** Compact mode: hides the usage card, just shows provider status. */
  compact?: boolean;
}

const HEALTH_STYLES: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <CheckCircle2 className="w-4 h-4" />, label: 'Healthy' },
  degraded: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: <AlertCircle className="w-4 h-4" />, label: 'Degraded' },
  unhealthy: { color: 'text-rose-400', bg: 'bg-rose-500/10', icon: <XCircle className="w-4 h-4" />, label: 'Unhealthy' },
  disabled: { color: 'text-slate-500', bg: 'bg-slate-500/10', icon: <ShieldAlert className="w-4 h-4" />, label: 'Disabled' },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export const AIGatewayPanel: React.FC<AIGatewayPanelProps> = ({ adminSecret, compact }) => {
  const [providers, setProviders] = useState<ProviderHealthSnapshot[]>([]);
  const [usage, setUsage] = useState<UserUsageSnapshot | null>(null);
  const [paidEnabled, setPaidEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, configRes] = await Promise.all([getHealth(), getConfig()]);
      setProviders(healthRes.providers);
      setPaidEnabled(configRes.paidEnabled);
      if (!compact) {
        try {
          setUsage(await getUsage());
        } catch {
          // Usage requires auth — silently skip if not logged in.
        }
      }
    } catch (e) {
      if (e instanceof AIGatewayClientError) {
        setError(`${e.code}: ${e.message}`);
      } else {
        setError((e as Error).message || 'Failed to load gateway status.');
      }
    } finally {
      setLoading(false);
    }
  }, [compact]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [refresh]);

  const handleProbe = async () => {
    if (!adminSecret) return;
    setProbing(true);
    try {
      const res = await probeHealth(adminSecret);
      setProviders(res.providers);
    } catch (e) {
      setError(e instanceof AIGatewayClientError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setProbing(false);
    }
  };

  const usagePct = usage
    ? Math.min(100, (usage.tokensUsed / Math.max(1, usage.tokenLimit)) * 100)
    : 0;
  const reqPct = usage
    ? Math.min(100, (usage.requests / Math.max(1, usage.requestLimit)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-indigo-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Gateway</h3>
            <p className="text-[11px] text-slate-400">Multi-provider router &amp; usage</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {adminSecret && (
            <button
              onClick={handleProbe}
              disabled={probing}
              className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
            >
              {probing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Probe
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {providers.map((p) => {
          const style = HEALTH_STYLES[p.health] || HEALTH_STYLES.disabled;
          return (
            <div
              key={p.id}
              className={`p-3 rounded-xl border border-white/10 ${style.bg} backdrop-blur-md`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`flex items-center gap-1 ${style.color}`}>
                      {style.icon}
                    </span>
                    <span className="text-sm font-medium text-white truncate">{p.label}</span>
                    {p.paid && (
                      <span className="px-1 py-0.5 text-[9px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        PAID
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {p.defaultModel}
                  </div>
                </div>
                <span className={`text-[10px] font-medium ${style.color}`}>{style.label}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                <span>Fails: {p.consecutiveFailures}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {p.health === 'disabled' ? '—' : timeAgo(p.lastSuccessAt)}
                </span>
              </div>
              {p.lastError && p.health !== 'healthy' && (
                <div className="mt-1.5 text-[10px] text-rose-300/80 line-clamp-2">
                  {p.lastError}
                </div>
              )}
            </div>
          );
        })}
        {providers.length === 0 && !loading && (
          <div className="col-span-full text-center py-6 text-xs text-slate-500">
            No providers configured. Set GEMINI_API_KEY in .env to enable the primary provider.
          </div>
        )}
      </div>

      {/* Usage card */}
      {!compact && usage && (
        <div className="p-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-200 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-indigo-300" />
              Your usage (24h)
            </span>
            <span className="text-[10px] text-slate-400 capitalize">{usage.plan} plan</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Requests</span>
              <span>{usage.requests} / {formatNumber(usage.requestLimit)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${reqPct > 80 ? 'bg-rose-400' : reqPct > 50 ? 'bg-amber-400' : 'bg-indigo-400'}`}
                initial={{ width: 0 }}
                animate={{ width: `${reqPct}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Tokens</span>
              <span>{formatNumber(usage.tokensUsed)} / {formatNumber(usage.tokenLimit)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${usagePct > 80 ? 'bg-rose-400' : usagePct > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                initial={{ width: 0 }}
                animate={{ width: `${usagePct}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
          {Object.keys(usage.byProvider).length > 0 && (
            <div className="pt-1.5 border-t border-white/5">
              <div className="text-[10px] text-slate-500 mb-1">By provider</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(usage.byProvider) as [string, { requests: number; tokens: number } | undefined][])
                  .map(([id, stats]) => (
                  <span
                    key={id}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-slate-300 border border-white/10"
                  >
                    {id}: {stats?.requests || 0} req · {formatNumber(stats?.tokens || 0)} tok
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer hint */}
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <Activity className="w-2.5 h-2.5" />
        <span>
          {paidEnabled
            ? 'Paid AI models are currently enabled.'
            : 'Free-first mode — paid models are disabled.'}
        </span>
      </div>
    </div>
  );
};

export default AIGatewayPanel;

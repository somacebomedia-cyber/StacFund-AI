// components/FundingCountdown.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, AlertTriangle, Zap, Calendar, ExternalLink, CheckCircle2, 
  ArrowRight, Bell, BellRing, ChevronRight, ShieldAlert, FileText, 
  Sparkles, CalendarPlus, ChevronDown, ChevronUp, Plus, Filter, Info, X
} from 'lucide-react';
import { User, Application, FundingOpportunityDb, FundingType, FundingDeadlineItem, ApplicationStatus } from '../types';
import { 
  compileUserDeadlines, 
  checkAndTrigger48hNotifications, 
  createCalendarEvent, 
  getCutoffCountdown 
} from '../services/fundingDeadlineService';

interface FundingCountdownProps {
  user: User | null;
  applications: Application[];
  opportunities: FundingOpportunityDb[];
  onOpenApplication: (oppId: string, isDraft?: boolean, oppFallback?: any) => void;
  onNavigateToApplications?: () => void;
}

export const FundingCountdown: React.FC<FundingCountdownProps> = ({
  user,
  applications,
  opportunities,
  onOpenApplication,
  onNavigateToApplications
}) => {
  const [now, setNow] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'urgent' | 'my_apps' | 'grants'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);
  const [notificationToast, setNotificationToast] = useState<{ show: boolean; message: string } | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [customDeadlineModal, setCustomDeadlineModal] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customIssuer, setCustomIssuer] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customDeadlines, setCustomDeadlines] = useState<FundingDeadlineItem[]>(() => {
    try {
      const saved = localStorage.getItem('stacfund_custom_deadlines');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Ticking timer: Updates every second for real-time countdown precision
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compile full list of deadlines
  const allDeadlines = useMemo(() => {
    const compiled = compileUserDeadlines(applications, opportunities, now);
    // Merge custom deadlines
    const customActive = customDeadlines
      .map(item => {
        const countdown = getCutoffCountdown(new Date(item.cutoffDate), now);
        return {
          ...item,
          ...countdown
        };
      })
      .filter(item => !item.passed);

    return [...customActive, ...compiled].sort((a, b) => new Date(a.cutoffDate).getTime() - new Date(b.cutoffDate).getTime());
  }, [applications, opportunities, customDeadlines, now]);

  // Automated 48-Hour Cutoff Detection & Notification Trigger
  useEffect(() => {
    if (!user) return;

    const triggerNotifications = async () => {
      const triggered = await checkAndTrigger48hNotifications(user, allDeadlines);
      if (triggered > 0) {
        setNotificationToast({
          show: true,
          message: `🚨 ${triggered} cutoff deadline${triggered > 1 ? 's are' : ' is'} within 48 hours! An alert notification has been added.`
        });
        setTimeout(() => setNotificationToast(null), 7000);
      }
    };

    triggerNotifications();
  }, [user?.id, allDeadlines.length]);

  // Listen to in-app custom event
  useEffect(() => {
    const handleCutoffEvent = (event: any) => {
      const { item, hoursLeft } = event.detail;
      setNotificationToast({
        show: true,
        message: `⚠️ URGENT CUTOFF: "${item.title}" closes in ~${hoursLeft} hours! Submit now.`
      });
      setTimeout(() => setNotificationToast(null), 8000);
    };

    window.addEventListener('stacfund_cutoff_triggered', handleCutoffEvent);
    return () => window.removeEventListener('stacfund_cutoff_triggered', handleCutoffEvent);
  }, []);

  // Critical deadlines (< 48 hours)
  const criticalDeadlines = useMemo(() => {
    return allDeadlines.filter(d => d.urgency === 'critical');
  }, [allDeadlines]);

  // Filtered deadlines based on active tab
  const filteredDeadlines = useMemo(() => {
    switch (filter) {
      case 'urgent':
        return allDeadlines.filter(d => d.urgency === 'critical');
      case 'my_apps':
        return allDeadlines.filter(d => d.isApplication);
      case 'grants':
        return allDeadlines.filter(d => d.type === FundingType.GRANT || String(d.type).toUpperCase() === 'GRANT');
      case 'all':
      default:
        return allDeadlines;
    }
  }, [allDeadlines, filter]);

  // Handle request for browser push notifications
  const handleEnablePush = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setHasRequestedPermission(true);
      if (perm === 'granted') {
        new Notification('🔔 StacFund Cutoff Alerts Enabled', {
          body: 'You will receive reminders 48 hours and 2 hours before important funding deadlines.',
          icon: '/icon.png'
        });
      }
    }
  };

  // Add custom cutoff to tracking
  const handleAddCustomDeadline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle || !customDate) return;

    const newItem: FundingDeadlineItem = {
      id: `custom_${Date.now()}`,
      opportunityId: `custom_${Date.now()}`,
      title: customTitle,
      provider: customIssuer || 'Municipal / Private Window',
      type: FundingType.GRANT,
      amountText: customAmount || 'Grant / Tender Opportunity',
      cutoffDate: new Date(customDate).toISOString(),
      requiredDocs: ['Application Form', 'Tax Pin', 'CIPC Registration'],
      eligibilitySummary: 'Custom user-tracked funding cutoff date.',
      ...getCutoffCountdown(new Date(customDate), now)
    };

    const updated = [newItem, ...customDeadlines];
    setCustomDeadlines(updated);
    try {
      localStorage.setItem('stacfund_custom_deadlines', JSON.stringify(updated));
    } catch {
      // localStorage fallback
    }

    setCustomTitle('');
    setCustomIssuer('');
    setCustomAmount('');
    setCustomDate('');
    setCustomDeadlineModal(false);

    // If within 48 hours, immediately trigger notification
    if (user && newItem.urgency === 'critical') {
      checkAndTrigger48hNotifications(user, [newItem]);
    }
  };

  // Calendar export handler
  const handleCalendarExport = (item: FundingDeadlineItem) => {
    const event = createCalendarEvent(item);
    // Open Google Calendar in new tab
    window.open(event.googleUrl, '_blank', 'noopener,noreferrer');
  };

  // Download .ics file
  const handleDownloadIcs = (item: FundingDeadlineItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const event = createCalendarEvent(item);
    const blob = new Blob([event.icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', event.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const earliestCritical = criticalDeadlines[0];

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Dynamic Toast for newly triggered 48h deadline */}
      {notificationToast && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-md p-4 rounded-2xl bg-[#130d1f] border border-amber-500/40 shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-4">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 animate-pulse">
            <Zap size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white mb-0.5">Deadline Alert Triggered</h4>
            <p className="text-xs text-amber-200/90 leading-relaxed">{notificationToast.message}</p>
          </div>
          <button 
            onClick={() => setNotificationToast(null)} 
            className="text-gray-400 hover:text-white p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 48-Hour Urgent Cutoff Top Hero Banner (Show if at least 1 deadline is < 48 hours) */}
      {earliestCritical && !dismissedBanner && (
        <div className="relative overflow-hidden rounded-3xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-[#180e22]/90 to-purple-950/40 p-5 sm:p-6 shadow-[0_0_30px_rgba(244,63,94,0.15)] backdrop-blur-xl animate-in fade-in duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-[70px] pointer-events-none"></div>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative z-10">
            <div className="flex items-start sm:items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 relative">
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-ping"></span>
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full"></span>
                <Clock size={24} className="animate-pulse" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-rose-500 text-white shadow-sm flex items-center gap-1">
                    <Zap size={10} className="fill-white" /> Cutoff In Under 48 Hours
                  </span>
                  <span className="text-xs text-rose-300 font-bold">
                    {earliestCritical.provider}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white truncate">
                  {earliestCritical.title}
                </h3>
                <p className="text-xs text-gray-300/80 mt-0.5 truncate">
                  {earliestCritical.amountText} • Cutoff on {new Date(earliestCritical.cutoffDate).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </div>

            {/* Live Ticking Countdown Pill */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto shrink-0">
              <div className="bg-black/60 border border-rose-500/30 rounded-2xl p-2.5 px-4 flex items-center gap-3">
                <div className="text-center">
                  <span className="text-xl sm:text-2xl font-black text-white font-mono">
                    {String(earliestCritical.hours).padStart(2, '0')}
                  </span>
                  <p className="text-[9px] uppercase font-bold text-rose-400 tracking-wider">Hours</p>
                </div>
                <span className="text-rose-400 font-bold text-xl mb-3">:</span>
                <div className="text-center">
                  <span className="text-xl sm:text-2xl font-black text-white font-mono">
                    {String(earliestCritical.minutes).padStart(2, '0')}
                  </span>
                  <p className="text-[9px] uppercase font-bold text-rose-400 tracking-wider">Mins</p>
                </div>
                <span className="text-rose-400 font-bold text-xl mb-3">:</span>
                <div className="text-center">
                  <span className="text-xl sm:text-2xl font-black text-rose-400 font-mono">
                    {String(earliestCritical.seconds).padStart(2, '0')}
                  </span>
                  <p className="text-[9px] uppercase font-bold text-rose-400 tracking-wider">Secs</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenApplication(earliestCritical.opportunityId, earliestCritical.isApplication, {
                    title: earliestCritical.title,
                    provider: earliestCritical.provider,
                    type: earliestCritical.type
                  })}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all shrink-0 hover:scale-[1.02] active:scale-95"
                >
                  {earliestCritical.isApplication ? 'Resume Submission' : 'Finalize & Submit'}
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => setDismissedBanner(true)}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Minimize urgent banner"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Countdown Dashboard Section */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden group w-full min-w-0">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 blur-[90px] pointer-events-none"></div>

        {/* Header with Title & Filter Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Clock size={20} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">Funding Countdown</h2>
              {criticalDeadlines.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                  <Zap size={10} className="fill-rose-400" /> {criticalDeadlines.length} Cutoff{criticalDeadlines.length > 1 ? 's' : ''} &lt; 48h
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-400">
              Live countdown clocks for upcoming grant cohort deadlines and active applications.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {'Notification' in window && Notification.permission !== 'granted' && (
              <button
                onClick={handleEnablePush}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-purple-300 hover:text-white transition-all flex items-center gap-1.5"
                title="Enable browser notifications for upcoming cutoff deadlines"
              >
                <BellRing size={14} /> Enable Cutoff Alerts
              </button>
            )}
            <button
              onClick={() => setCustomDeadlineModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-600/20"
            >
              <Plus size={14} /> Track Custom Cutoff
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/5 mb-6 text-xs font-bold hide-scrollbar">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'all' 
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' 
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            All Deadlines ({allDeadlines.length})
          </button>
          <button
            onClick={() => setFilter('urgent')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'urgent' 
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20' 
                : 'bg-white/5 text-rose-400 hover:bg-white/10'
            }`}
          >
            <Zap size={13} className={filter === 'urgent' ? 'fill-white' : 'fill-rose-400'} />
            Urgent &lt; 48 Hours ({criticalDeadlines.length})
          </button>
          <button
            onClick={() => setFilter('my_apps')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'my_apps' 
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' 
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <FileText size={13} />
            My In-Progress ({allDeadlines.filter(d => d.isApplication).length})
          </button>
          <button
            onClick={() => setFilter('grants')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'grants' 
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' 
                : 'bg-white/5 text-emerald-400 hover:bg-white/10'
            }`}
          >
            <Sparkles size={13} />
            Non-Repayable Grants ({allDeadlines.filter(d => d.type === FundingType.GRANT || String(d.type).toUpperCase() === 'GRANT').length})
          </button>
        </div>

        {/* Deadlines List */}
        <div className="space-y-4 relative z-10">
          {filteredDeadlines.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/5">
              <Clock size={36} className="mx-auto text-gray-500 mb-3 opacity-40" />
              <p className="text-gray-400 font-bold text-sm">No deadlines match this filter.</p>
              <p className="text-xs text-gray-500 mt-1">Check back later or add a custom tender/grant cutoff to track.</p>
            </div>
          ) : (
            filteredDeadlines.map((item) => {
              const isExpanded = expandedId === item.id;
              const isCritical = item.urgency === 'critical';
              const isImminent = item.urgency === 'imminent';

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                    isCritical 
                      ? 'bg-gradient-to-r from-rose-950/20 to-[#0e0918]/80 border-rose-500/30 hover:border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.08)]' 
                      : isImminent
                        ? 'bg-gradient-to-r from-amber-950/20 to-[#0e0918]/80 border-amber-500/30 hover:border-amber-500/50'
                        : 'bg-[#0f0f1c]/70 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                      {/* Left Side: Program info & urgency badge */}
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-[#111] overflow-hidden flex items-center justify-center text-xl border border-white/10 shrink-0 p-1.5 shadow-inner">
                          {item.logoUrl ? (
                            <img 
                              src={item.logoUrl} 
                              alt={item.provider} 
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-gray-400 font-bold text-xs uppercase">
                              {item.provider.substring(0, 3)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {/* Urgency Badge */}
                            {isCritical ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1 animate-pulse">
                                <Zap size={10} className="fill-rose-400" /> &lt; 48H Cutoff
                              </span>
                            ) : isImminent ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                                <Clock size={10} /> &lt; 7 Days
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                Open Window
                              </span>
                            )}

                            {item.isApplication && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                My Draft Application
                              </span>
                            )}

                            <span className="text-[10px] text-gray-400 font-bold">
                              {item.provider}
                            </span>
                          </div>

                          <h4 className="text-base sm:text-lg font-bold text-white group-hover:text-purple-300 transition-colors truncate">
                            {item.title}
                          </h4>

                          <p className="text-xs text-emerald-400 font-semibold mt-0.5">
                            {item.amountText}
                          </p>

                          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1.5">
                            <Calendar size={12} className="text-purple-400 shrink-0" />
                            Cutoff: <span className="text-gray-200 font-medium">
                              {new Date(item.cutoffDate).toLocaleString('en-ZA', { 
                                weekday: 'short', 
                                day: 'numeric', 
                                month: 'short', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })} SAST
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Right Side: Live Ticking Countdown Badges & Actions */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
                        {/* Countdown Digits Matrix */}
                        <div className="flex items-center gap-2 p-2 bg-black/40 border border-white/10 rounded-2xl">
                          {item.days > 0 && (
                            <div className="px-3 py-1.5 rounded-xl bg-white/5 text-center min-w-[50px]">
                              <span className="text-base sm:text-lg font-black text-white font-mono">
                                {item.days}
                              </span>
                              <span className="block text-[8px] font-black uppercase text-gray-400 tracking-wider">Days</span>
                            </div>
                          )}
                          <div className={`px-3 py-1.5 rounded-xl text-center min-w-[50px] ${isCritical ? 'bg-rose-500/20 border border-rose-500/30' : 'bg-white/5'}`}>
                            <span className={`text-base sm:text-lg font-black font-mono ${isCritical ? 'text-rose-400' : 'text-white'}`}>
                              {String(item.hours).padStart(2, '0')}
                            </span>
                            <span className="block text-[8px] font-black uppercase text-gray-400 tracking-wider">Hrs</span>
                          </div>
                          <span className="text-gray-600 font-bold">:</span>
                          <div className="px-3 py-1.5 rounded-xl bg-white/5 text-center min-w-[50px]">
                            <span className="text-base sm:text-lg font-black text-white font-mono">
                              {String(item.minutes).padStart(2, '0')}
                            </span>
                            <span className="block text-[8px] font-black uppercase text-gray-400 tracking-wider">Min</span>
                          </div>
                          <span className="text-gray-600 font-bold">:</span>
                          <div className="px-3 py-1.5 rounded-xl bg-white/5 text-center min-w-[50px]">
                            <span className="text-base sm:text-lg font-black text-purple-400 font-mono">
                              {String(item.seconds).padStart(2, '0')}
                            </span>
                            <span className="block text-[8px] font-black uppercase text-purple-400/80 tracking-wider">Sec</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => onOpenApplication(item.opportunityId, item.isApplication, {
                              title: item.title,
                              provider: item.provider,
                              type: item.type
                            })}
                            className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md flex-1 sm:flex-initial ${
                              isCritical
                                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
                            }`}
                          >
                            {item.isApplication ? 'Resume App' : 'Apply Now'}
                            <ArrowRight size={14} />
                          </button>

                          <button
                            onClick={() => handleCalendarExport(item)}
                            title="Add cutoff reminder to Google Calendar"
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                          >
                            <CalendarPlus size={16} />
                          </button>

                          <button
                            onClick={(e) => handleDownloadIcs(item, e)}
                            title="Download iCal (.ics) file"
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors text-[10px] font-bold"
                          >
                            .ICS
                          </button>

                          <button
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            title="Toggle Checklist & Details"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Checklist & Eligibility Drawer */}
                    {isExpanded && (
                      <div className="mt-5 pt-4 border-t border-white/5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                            <h5 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Info size={14} className="text-purple-400" /> Eligibility Summary
                            </h5>
                            <p className="text-xs text-gray-400 leading-relaxed">
                              {item.eligibilitySummary || 'Standard South African SMME eligibility criteria apply.'}
                            </p>
                          </div>

                          <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                            <h5 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <FileText size={14} className="text-emerald-400" /> Mandatory Checklist Before Cutoff
                            </h5>
                            <div className="space-y-1.5">
                              {(item.requiredDocs || ['Business Plan', 'CIPC Docs', 'Tax Clearance']).map((doc, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs text-gray-400">
                                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                                  <span className="truncate">{doc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs pt-1">
                          <span className="text-[11px] text-gray-500">
                            Opportunity ID: <span className="font-mono text-gray-400">{item.opportunityId}</span>
                          </span>
                          {item.applicationUrl && (
                            <a
                              href={item.applicationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 font-bold text-xs"
                            >
                              Official Portal <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal: Track Custom Cutoff */}
      {customDeadlineModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0f0f1f] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setCustomDeadlineModal(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                <CalendarPlus size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Track Custom Cutoff</h3>
                <p className="text-xs text-gray-400">Add an external grant, municipal RFP, or tender deadline.</p>
              </div>
            </div>

            <form onSubmit={handleAddCustomDeadline} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Opportunity or Tender Name
                </label>
                <input
                  type="text"
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. City of Joburg Youth SMME Grant"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Funding Institution / Issuer
                </label>
                <input
                  type="text"
                  value={customIssuer}
                  onChange={(e) => setCustomIssuer(e.target.value)}
                  placeholder="e.g. City of Johannesburg"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Grant / Funding Amount
                </label>
                <input
                  type="text"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="e.g. Up to R250,000"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Cutoff Date & Time (SAST)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  If set within 48 hours, an urgent notification will be automatically triggered!
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCustomDeadlineModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow-md shadow-purple-600/20"
                >
                  Start Countdown
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FundingCountdown;

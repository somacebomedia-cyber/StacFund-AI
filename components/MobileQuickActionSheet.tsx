// components/MobileQuickActionSheet.tsx
import React from 'react';
import { 
  X, 
  Presentation, 
  ScanLine, 
  Search, 
  ShieldCheck, 
  Wand2, 
  FileText, 
  MessageCircle, 
  Sparkles, 
  ChevronRight,
  Zap,
  ArrowUpRight
} from 'lucide-react';

interface QuickActionItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  badge?: string;
  action: () => void;
}

interface MobileQuickActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
  onTriggerTool: (toolId: string) => void;
  onAskAI?: () => void;
}

export const MobileQuickActionSheet: React.FC<MobileQuickActionSheetProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onTriggerTool,
  onAskAI,
}) => {
  if (!isOpen) return null;

  const quickActions: QuickActionItem[] = [
    {
      id: 'search',
      title: 'Search & Match Grants',
      description: 'Find active SA government grants & equity funds',
      icon: Search,
      gradient: 'from-blue-500 to-cyan-500',
      badge: 'Popular',
      action: () => {
        onNavigate('funding');
        onClose();
      },
    },
    {
      id: 'needs',
      title: 'Calculate Funding Needs',
      description: 'Audit readiness, FICA, BEE & funding deficit',
      icon: ShieldCheck,
      gradient: 'from-emerald-500 to-teal-500',
      action: () => {
        onNavigate('needs');
        onClose();
      },
    },
    {
      id: 'presentation',
      title: 'AI Pitch Deck Builder',
      description: 'Generate investor-ready slide deck in seconds',
      icon: Presentation,
      gradient: 'from-purple-500 to-indigo-500',
      badge: 'AI Powered',
      action: () => {
        onTriggerTool('presentation');
        onClose();
      },
    },
    {
      id: 'digitizer',
      title: 'Form Auto-Fill Scanner',
      description: 'Scan & digitize official grant application PDFs',
      icon: ScanLine,
      gradient: 'from-amber-500 to-orange-500',
      action: () => {
        onTriggerTool('digitizer');
        onClose();
      },
    },
    {
      id: 'proposal',
      title: 'Proposal & Business Plan',
      description: 'Draft bankable institutional plans & grant bids',
      icon: FileText,
      gradient: 'from-fuchsia-500 to-pink-500',
      action: () => {
        onTriggerTool('proposal');
        onClose();
      },
    },
    {
      id: 'logo',
      title: 'AI Brand & Logo Studio',
      description: 'Generate commercial business logos & palettes',
      icon: Wand2,
      gradient: 'from-violet-500 to-purple-600',
      action: () => {
        onTriggerTool('logo');
        onClose();
      },
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Crowdsourcer',
      description: 'Mobilize local backers & community supporters',
      icon: MessageCircle,
      gradient: 'from-green-500 to-emerald-600',
      action: () => {
        onTriggerTool('whatsapp');
        onClose();
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
      {/* Dimmed backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-up sheet */}
      <div className="relative w-full bg-[#0a0a1a] border-t border-white/15 rounded-t-3xl max-h-[85vh] flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.8)] z-10 animate-in slide-in-from-bottom duration-300">
        {/* Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>

        {/* Sheet Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-900/30">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-tight">Create & Quick Actions</h3>
              <p className="text-[11px] text-gray-400">Launch workflows with one tap</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close action sheet"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Actions Grid */}
        <div className="p-4 space-y-2.5 overflow-y-auto custom-scrollbar pb-8">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.action}
                className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/5 hover:border-purple-500/30 transition-all text-left group"
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${item.gradient} flex items-center justify-center text-white shrink-0 shadow-md`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors truncate">
                      {item.title}
                    </span>
                    {item.badge && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded-md border border-purple-500/30 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                    {item.description}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}

          {onAskAI && (
            <div className="pt-2">
              <button
                onClick={() => {
                  onClose();
                  onAskAI();
                }}
                className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border border-purple-500/40 text-purple-200 hover:text-white font-bold text-xs uppercase tracking-wider transition-all"
              >
                <Sparkles size={16} className="text-purple-400" />
                Ask StacFund AI Copilot
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileQuickActionSheet;

// components/MobileMoreSheet.tsx
import React from 'react';
import { 
  X, 
  FileText, 
  FolderOpen, 
  Zap, 
  Crown, 
  UserCircle, 
  Bell, 
  LogOut, 
  ChevronRight, 
  ExternalLink,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { User } from '../types';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
  onOpenNotifications: () => void;
  onOpenPricing: () => void;
  onLogout: () => void;
  user: User | null;
  unreadCount?: number;
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenNotifications,
  onOpenPricing,
  onLogout,
  user,
  unreadCount = 0,
}) => {
  if (!isOpen) return null;

  const handleItemClick = (page: string) => {
    onNavigate(page);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
      {/* Backdrop */}
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
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 overflow-hidden flex items-center justify-center shrink-0">
              {user?.logoUrl ? (
                <img src={user.logoUrl} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                <span className="text-white text-xs font-bold font-mono">
                  {(user?.businessName || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">{user?.businessName || 'My Business'}</h3>
              <p className="text-[11px] text-gray-400 truncate">{user?.email || 'Logged In'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar pb-8">
          {/* Subscription Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Crown size={16} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    {user?.subscriptionPlan === 'business' ? 'Constellation' : user?.subscriptionPlan === 'pro' ? 'Orbital' : 'Cadet (Free)'}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">
                  {user?.subscriptionPlan === 'free' ? 'Unlock unlimited grants & digitizer' : 'Active membership'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenPricing();
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-extrabold text-xs uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-md shadow-amber-950/30"
            >
              {user?.subscriptionPlan === 'free' ? 'Upgrade' : 'Manage'}
            </button>
          </div>

          {/* Primary Hub Sections */}
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">
              Mission Control & Tools
            </div>
            <div className="space-y-1.5">
              <button
                onClick={() => handleItemClick('applications')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/5 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                      Applications Tracker
                    </span>
                    <p className="text-xs text-gray-400">Track submitted & draft funding applications</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
              </button>

              <button
                onClick={() => handleItemClick('documents')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/5 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <FolderOpen size={18} />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                      Documents Vault
                    </span>
                    <p className="text-xs text-gray-400">FICA, CIPC, BEE, financial statements & tax clearance</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
              </button>

              <button
                onClick={() => handleItemClick('tools')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/5 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Zap size={18} />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                      Smart Tools Hub
                    </span>
                    <p className="text-xs text-gray-400">Pitch designer, form digitizer, logo generator & proposal studio</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          {/* Account & Notifications */}
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">
              Account & Settings
            </div>
            <div className="space-y-1.5">
              <button
                onClick={() => handleItemClick('profile')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/5 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <UserCircle size={18} />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                      Business Profile & Settings
                    </span>
                    <p className="text-xs text-gray-400">Company info, sector, turnover & BYOK key</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenNotifications();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/5 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center relative">
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                      Notifications
                    </span>
                    <p className="text-xs text-gray-400">
                      {unreadCount > 0 ? `${unreadCount} unread funding alerts` : 'All caught up'}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          {/* Log Out */}
          <div className="pt-2">
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-extrabold text-xs uppercase tracking-wider transition-all"
            >
              <LogOut size={16} />
              Log Out of StacFund
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileMoreSheet;

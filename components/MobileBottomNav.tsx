// components/MobileBottomNav.tsx
import React from 'react';
import { LayoutDashboard, Search, Plus, ShieldCheck, Layers } from 'lucide-react';

export type BottomNavTab = 'dashboard' | 'funding' | 'needs' | 'more';

interface MobileBottomNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenQuickAction: () => void;
  onOpenMore: () => void;
  isMoreOpen?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentPage,
  onNavigate,
  onOpenQuickAction,
  onOpenMore,
  isMoreOpen = false,
}) => {
  // Determine if active
  const isDashboardActive = currentPage === 'dashboard' && !isMoreOpen;
  const isFundingActive = currentPage === 'funding' && !isMoreOpen;
  const isNeedsActive = currentPage === 'needs' && !isMoreOpen;

  return (
    <nav 
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070714]/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] px-3 pb-safe"
    >
      <div className="relative flex items-center justify-between h-16 max-w-lg mx-auto">
        {/* Tab 1: Launchpad (Home) */}
        <button
          onClick={() => onNavigate('dashboard')}
          aria-label="Go to Launchpad"
          className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[44px] min-w-[44px] transition-all group ${
            isDashboardActive ? 'text-purple-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <LayoutDashboard 
              size={20} 
              className={`transition-transform duration-200 ${isDashboardActive ? 'scale-110 stroke-[2.2]' : 'group-hover:scale-105'}`} 
            />
            {isDashboardActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_6px_#a855f7]" />
            )}
          </div>
          <span className={`text-[10px] mt-1 tracking-tight transition-colors ${
            isDashboardActive ? 'font-extrabold text-white' : 'font-medium'
          }`}>
            Launchpad
          </span>
        </button>

        {/* Tab 2: Funding Explorer */}
        <button
          onClick={() => onNavigate('funding')}
          aria-label="Explore Funding"
          className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[44px] min-w-[44px] transition-all group ${
            isFundingActive ? 'text-purple-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <Search 
              size={20} 
              className={`transition-transform duration-200 ${isFundingActive ? 'scale-110 stroke-[2.2]' : 'group-hover:scale-105'}`} 
            />
            {isFundingActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_6px_#a855f7]" />
            )}
          </div>
          <span className={`text-[10px] mt-1 tracking-tight transition-colors ${
            isFundingActive ? 'font-extrabold text-white' : 'font-medium'
          }`}>
            Funding
          </span>
        </button>

        {/* Center: Canva-Style Elevated Quick Action Button */}
        <div className="flex-1 flex flex-col items-center justify-center relative -top-3">
          <button
            onClick={onOpenQuickAction}
            aria-label="Open AI Quick Actions"
            title="Create & AI Actions"
            className="w-13 h-13 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 p-[2px] shadow-lg shadow-purple-900/50 hover:shadow-purple-700/60 transition-all duration-200 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-purple-400/50"
          >
            <div className="w-full h-full rounded-full bg-[#070714]/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-transparent transition-colors">
              <Plus 
                size={24} 
                className="text-white drop-shadow-md transition-transform duration-300 group-hover:rotate-90 stroke-[2.5]" 
              />
            </div>
          </button>
          <span className="text-[10px] font-extrabold text-purple-300 tracking-tight mt-0.5">
            Create
          </span>
        </div>

        {/* Tab 3: Funding Needs & Compliance */}
        <button
          onClick={() => onNavigate('needs')}
          aria-label="Funding Needs & Compliance"
          className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[44px] min-w-[44px] transition-all group ${
            isNeedsActive ? 'text-purple-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <ShieldCheck 
              size={20} 
              className={`transition-transform duration-200 ${isNeedsActive ? 'scale-110 stroke-[2.2]' : 'group-hover:scale-105'}`} 
            />
            {isNeedsActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_6px_#a855f7]" />
            )}
          </div>
          <span className={`text-[10px] mt-1 tracking-tight transition-colors ${
            isNeedsActive ? 'font-extrabold text-white' : 'font-medium'
          }`}>
            Needs
          </span>
        </button>

        {/* Tab 4: More / Tools Hub */}
        <button
          onClick={onOpenMore}
          aria-label="More Options & Tools"
          className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[44px] min-w-[44px] transition-all group ${
            isMoreOpen || (['applications', 'documents', 'tools', 'profile'].includes(currentPage))
              ? 'text-purple-400' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <Layers 
              size={20} 
              className={`transition-transform duration-200 ${(isMoreOpen || ['applications', 'documents', 'tools', 'profile'].includes(currentPage)) ? 'scale-110 stroke-[2.2]' : 'group-hover:scale-105'}`} 
            />
            {(isMoreOpen || ['applications', 'documents', 'tools', 'profile'].includes(currentPage)) && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_6px_#a855f7]" />
            )}
          </div>
          <span className={`text-[10px] mt-1 tracking-tight transition-colors ${
            isMoreOpen || (['applications', 'documents', 'tools', 'profile'].includes(currentPage)) ? 'font-extrabold text-white' : 'font-medium'
          }`}>
            More
          </span>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;

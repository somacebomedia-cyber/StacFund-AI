
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  colorClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, colorClass = "text-purple-500" }) => {
  return (
    <div className="glass-panel rounded-2xl p-3 sm:p-5 lg:p-6 flex flex-col items-center justify-center text-center gap-2 sm:gap-4 hover:bg-white/5 transition-colors cursor-default min-w-0 w-full overflow-hidden">
      <div className={`p-2 sm:p-3 rounded-xl bg-white/5 shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div className="min-w-0 w-full">
        <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">{value}</h3>
        <p className="text-gray-400 text-[10px] sm:text-xs lg:text-sm font-bold uppercase tracking-wider md:normal-case md:tracking-normal truncate">{label}</p>
      </div>
    </div>
  );
};

export default StatCard;

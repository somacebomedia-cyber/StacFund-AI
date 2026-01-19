
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  colorClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, colorClass = "text-purple-500" }) => {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col items-start gap-4 hover:bg-white/5 transition-colors cursor-default">
      <div className={`p-3 rounded-xl bg-white/5 ${colorClass}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-3xl font-bold">{value}</h3>
        <p className="text-gray-400 text-sm">{label}</p>
      </div>
    </div>
  );
};

export default StatCard;

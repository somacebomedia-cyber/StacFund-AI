import React from 'react';
import { motion } from 'motion/react';
import { FileCheck, Activity, Check, Clock } from 'lucide-react';

interface ComplianceItem {
  id: string;
  name: string;
  dueDate: string;
  isComplete: boolean;
  notes?: string;
}

interface ComplianceTrackerProps {
  items: ComplianceItem[];
}

const ComplianceTracker: React.FC<ComplianceTrackerProps> = ({ items }) => {
  const completeCount = items.filter(i => i.isComplete).length;
  const progressPercent = items.length > 0 ? (completeCount / items.length) * 100 : 0;

  return (
    <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
      <div className="absolute top-[-20%] right-[-20%] w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] group-hover:bg-emerald-500/20 transition-all pointer-events-none"></div>
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <Activity size={20} />
        </div>
        <div>
          <h3 className="text-xl font-black">Compliance Tracker</h3>
          <p className="text-xs text-gray-400 font-medium">Keep your foundational docs up to date</p>
        </div>
      </div>

      <div className="mb-8 relative z-10">
        <div className="flex justify-between text-xs font-bold mb-2">
          <span className="text-gray-400 uppercase tracking-widest">Progress</span>
          <span className="text-emerald-400">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full relative overflow-hidden shadow-[0_0_15px_rgba(52,211,153,0.3)]"
          >
            {/* Shimmer effect inside the bar */}
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
              className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            ></motion.div>
          </motion.div>
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        {items.map((item, i) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15 + 0.5, duration: 0.5 }}
            className={`p-4 rounded-2xl border transition-all flex items-start gap-4 ${
              item.isComplete 
                ? 'bg-emerald-500/5 border-emerald-500/20' 
                : 'bg-white/5 border-white/5 hover:border-white/10'
            }`}
          >
            <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
              item.isComplete
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                : 'bg-transparent text-transparent border-gray-600'
            }`}>
              <Check size={14} />
            </div>
            
            <div className="flex-1">
              <h4 className={`text-sm font-bold ${item.isComplete ? 'text-white' : 'text-gray-300'}`}>
                {item.name}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="text-gray-500" size={12} />
                <span className={`text-[10px] uppercase tracking-wider font-bold ${
                  item.isComplete ? 'text-emerald-400/80' : 'text-amber-400/80'
                }`}>
                  {item.isComplete ? 'Valid Until' : 'Action Required By'}: {item.dueDate}
                </span>
              </div>
              {item.notes && !item.isComplete && (
                <p className="text-[10px] text-gray-500 mt-2">{item.notes}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ComplianceTracker;

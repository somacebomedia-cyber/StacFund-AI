// components/ApplicationFunnelChart.tsx
import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, FunnelChart, Funnel, Tooltip, Cell, LabelList 
} from 'recharts';
import { 
  Filter, CheckCircle2, Clock, AlertCircle, Trophy, ArrowRight, 
  Sparkles, Layers, ChevronRight, XCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { Application, ApplicationStatus } from '../types';

interface ApplicationFunnelChartProps {
  applications: Application[];
  onBrowseFunding?: () => void;
  onNavigateToApplications?: () => void;
}

export const ApplicationFunnelChart: React.FC<ApplicationFunnelChartProps> = ({
  applications,
  onBrowseFunding,
  onNavigateToApplications
}) => {
  // Aggregate counts per stage
  const stageStats = useMemo(() => {
    let drafts = 0;
    let submitted = 0;
    let underReview = 0;
    let approved = 0;
    let rejected = 0;

    applications.forEach(app => {
      switch (app.status) {
        case ApplicationStatus.DRAFT:
          drafts++;
          break;
        case ApplicationStatus.SUBMITTED:
          submitted++;
          break;
        case ApplicationStatus.UNDER_REVIEW:
          underReview++;
          break;
        case ApplicationStatus.APPROVED:
          approved++;
          break;
        case ApplicationStatus.REJECTED:
          rejected++;
          break;
        default:
          break;
      }
    });

    const totalStarted = drafts + submitted + underReview + approved + rejected;

    // Cumulative funnel stage data:
    // Every application entered as a Draft, then subset made it to Submitted, Under Review, and Approved.
    const funnelDrafts = totalStarted;
    const funnelSubmitted = submitted + underReview + approved;
    const funnelReview = underReview + approved;
    const funnelApproved = approved;

    // Calculate conversion rates
    const submissionRate = funnelDrafts > 0 ? Math.round((funnelSubmitted / funnelDrafts) * 100) : 0;
    const approvalRate = funnelSubmitted > 0 ? Math.round((funnelApproved / funnelSubmitted) * 100) : 0;

    return {
      drafts,
      submitted,
      underReview,
      approved,
      rejected,
      totalStarted,
      funnelDrafts,
      funnelSubmitted,
      funnelReview,
      funnelApproved,
      submissionRate,
      approvalRate
    };
  }, [applications]);

  // Recharts Funnel Data Array
  const funnelData = useMemo(() => {
    // If no applications, provide benchmark cohort preview values
    const isZero = stageStats.totalStarted === 0;

    return [
      {
        name: 'Draft Preparation',
        value: isZero ? 10 : Math.max(stageStats.funnelDrafts, 1),
        realCount: stageStats.drafts,
        fill: '#A855F7', // Purple
        conversion: '100% (Baseline)'
      },
      {
        name: 'Submitted to Portals',
        value: isZero ? 7 : Math.max(stageStats.funnelSubmitted, isZero ? 1 : (stageStats.funnelReview > 0 ? stageStats.funnelReview : 0.4)),
        realCount: stageStats.submitted,
        fill: '#3B82F6', // Blue
        conversion: `${stageStats.submissionRate}% submission rate`
      },
      {
        name: 'Due Diligence & Review',
        value: isZero ? 4 : Math.max(stageStats.funnelReview, isZero ? 1 : (stageStats.funnelApproved > 0 ? stageStats.funnelApproved : 0.2)),
        realCount: stageStats.underReview,
        fill: '#F59E0B', // Amber
        conversion: `${stageStats.funnelSubmitted > 0 ? Math.round((stageStats.funnelReview / stageStats.funnelSubmitted) * 100) : 0}% review entry`
      },
      {
        name: 'Approved & Awarded',
        value: isZero ? 2 : Math.max(stageStats.funnelApproved, 0.1),
        realCount: stageStats.approved,
        fill: '#10B981', // Emerald
        conversion: `${stageStats.approvalRate}% win rate`
      }
    ];
  }, [stageStats]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-panel rounded-3xl p-6 sm:p-7 relative overflow-hidden group w-full min-w-0 border border-white/10 flex flex-col justify-between"
    >
      <motion.div 
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 blur-[80px] pointer-events-none" 
      />

      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                <Layers size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">Application Stage Funnel</h3>
            </div>
            <p className="text-xs text-gray-400">
              Pipeline conversion velocity from draft to awarded capital
            </p>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex items-center gap-2"
          >
            <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-xs font-mono font-bold text-gray-300">
              {stageStats.totalStarted} Total Apps
            </span>
            {stageStats.rejected > 0 && (
              <span className="px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-mono font-bold text-red-400 flex items-center gap-1">
                <XCircle size={12} /> {stageStats.rejected} Needs Rework
              </span>
            )}
          </motion.div>
        </div>

        {/* Recharts Funnel Chart with subtle entrance */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
          className="h-44 w-full relative z-10 my-1"
        >
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <Tooltip 
                formatter={(val: any, name: any, item: any) => {
                  const entry = item.payload;
                  return [
                    `${entry.realCount} active applications (${entry.conversion})`, 
                    entry.name
                  ];
                }}
                contentStyle={{
                  backgroundColor: 'rgba(10, 10, 24, 0.95)',
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: '1rem',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                  backdropFilter: 'blur(12px)',
                  fontSize: '12px'
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
              />
              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive
                animationDuration={750}
                animationEasing="ease-out"
              >
                {funnelData.map((entry, index) => (
                  <Cell key={`funnel-cell-${index}`} fill={entry.fill} />
                ))}
                <LabelList 
                  position="right" 
                  fill="#ffffff" 
                  stroke="none" 
                  dataKey="name" 
                  fontSize={11}
                  fontWeight="bold"
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Stage Conversion Rate Breakdown with Staggered Entrance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.28, ease: "easeOut" }}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-center transition-shadow hover:shadow-lg hover:shadow-purple-500/10"
          >
            <span className="text-[9px] uppercase font-black text-purple-400 block tracking-wider mb-0.5">1. In Draft</span>
            <span className="text-base font-mono font-black text-white">{stageStats.drafts}</span>
            <span className="text-[9px] text-gray-400 block mt-0.5">Preparing Docs</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.35, ease: "easeOut" }}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center transition-shadow hover:shadow-lg hover:shadow-blue-500/10"
          >
            <span className="text-[9px] uppercase font-black text-blue-400 block tracking-wider mb-0.5">2. Submitted</span>
            <span className="text-base font-mono font-black text-white">{stageStats.submitted}</span>
            <span className="text-[9px] text-blue-400/80 font-bold block mt-0.5">{stageStats.submissionRate}% rate</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.42, ease: "easeOut" }}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center transition-shadow hover:shadow-lg hover:shadow-amber-500/10"
          >
            <span className="text-[9px] uppercase font-black text-amber-400 block tracking-wider mb-0.5">3. In Review</span>
            <span className="text-base font-mono font-black text-white">{stageStats.underReview}</span>
            <span className="text-[9px] text-amber-400/80 font-bold block mt-0.5">Due Diligence</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.49, ease: "easeOut" }}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center transition-shadow hover:shadow-lg hover:shadow-emerald-500/10"
          >
            <span className="text-[9px] uppercase font-black text-emerald-400 block tracking-wider mb-0.5">4. Awarded</span>
            <span className="text-base font-mono font-black text-white">{stageStats.approved}</span>
            <span className="text-[9px] text-emerald-400/80 font-bold block mt-0.5">{stageStats.approvalRate}% success</span>
          </motion.div>
        </div>
      </div>

      {/* Footer Navigation */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs relative z-10"
      >
        <span className="text-gray-500">
          {stageStats.totalStarted === 0 
            ? 'No applications started yet. Cohort benchmarks shown.' 
            : `${stageStats.approved} approved out of ${stageStats.totalStarted} total submissions`}
        </span>
        {onNavigateToApplications ? (
          <button 
            onClick={onNavigateToApplications}
            className="text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-1 group"
          >
            Manage Applications <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : onBrowseFunding ? (
          <button 
            onClick={onBrowseFunding}
            className="text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-1 group"
          >
            Explore Grants <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : null}
      </motion.div>
    </motion.div>
  );
};

export default ApplicationFunnelChart;


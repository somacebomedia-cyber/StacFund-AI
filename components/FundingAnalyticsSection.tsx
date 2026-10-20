// components/FundingAnalyticsSection.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell 
} from 'recharts';
import { 
  Target, TrendingUp, DollarSign, Edit3, Check, X, ShieldCheck, 
  ArrowUpRight, Sparkles, AlertCircle, PieChart, Info
} from 'lucide-react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { User, Application, ApplicationStatus, FundingOpportunityDb, FundingType } from '../types';

interface FundingAnalyticsSectionProps {
  user: User | null;
  applications: Application[];
  opportunities: FundingOpportunityDb[];
  onBrowseFunding?: () => void;
  onOpenNeedsTracker?: () => void;
}

export const FundingAnalyticsSection: React.FC<FundingAnalyticsSectionProps> = ({
  user,
  applications,
  opportunities,
  onBrowseFunding,
  onOpenNeedsTracker
}) => {
  const [customGoal, setCustomGoal] = useState<number | null>(null);
  const [needsTotal, setNeedsTotal] = useState<number>(0);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState<string>('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);

  // Fetch user's custom goal from Firestore profile & funding_needs
  useEffect(() => {
    if (!user) return;

    const fetchGoalData = async () => {
      try {
        // 1. Fetch user doc for custom goal
        const userDocRef = doc(db, 'users', user.id);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.targetFundingGoal && typeof data.targetFundingGoal === 'number') {
            setCustomGoal(data.targetFundingGoal);
          }
        }

        // 2. Fetch funding_needs subcollection to compute aggregate items total
        const needsRef = collection(db, 'users', user.id, 'funding_needs');
        const needsSnap = await getDocs(needsRef);
        let sum = 0;
        needsSnap.forEach(d => {
          const val = Number(d.data().estimatedCost) || 0;
          sum += val;
        });
        setNeedsTotal(sum);
      } catch (err) {
        console.error('Error loading funding goal data:', err);
      }
    };

    fetchGoalData();
  }, [user]);

  // Total Goal: Custom goal if set, otherwise needs total, or default benchmark (R1,000,000)
  const targetGoal = useMemo(() => {
    if (customGoal && customGoal > 0) return customGoal;
    if (needsTotal > 0) return needsTotal;
    return 1000000; // R1,000,000 baseline benchmark
  }, [customGoal, needsTotal]);

  // Calculate Pipeline Values
  const pipelineMetrics = useMemo(() => {
    let approvedTotal = 0;
    let underReviewTotal = 0;
    let submittedTotal = 0;
    let draftTotal = 0;

    applications.forEach(app => {
      // Find opportunity for value estimation
      const opp = opportunities.find(o => o.opportunity_id === app.opportunityId);
      // Estimate value: if app has explicit amount or opp amount
      let estAmount = 150000;
      if (opp && opp.amount_max > 0) {
        estAmount = opp.amount_max <= 200000 
          ? opp.amount_max 
          : Math.round((opp.amount_min + opp.amount_max) / 2);
      }

      switch (app.status) {
        case ApplicationStatus.APPROVED:
          approvedTotal += estAmount;
          break;
        case ApplicationStatus.UNDER_REVIEW:
          underReviewTotal += estAmount;
          break;
        case ApplicationStatus.SUBMITTED:
          submittedTotal += estAmount;
          break;
        case ApplicationStatus.DRAFT:
          draftTotal += estAmount;
          break;
        default:
          break;
      }
    });

    const activeAppliedTotal = approvedTotal + underReviewTotal + submittedTotal + draftTotal;
    const progressPercent = Math.min(100, Math.round((activeAppliedTotal / targetGoal) * 100));
    const approvedPercent = Math.min(100, Math.round((approvedTotal / targetGoal) * 100));
    const remainingDeficit = Math.max(0, targetGoal - activeAppliedTotal);

    return {
      approvedTotal,
      underReviewTotal,
      submittedTotal,
      draftTotal,
      activeAppliedTotal,
      progressPercent,
      approvedPercent,
      remainingDeficit
    };
  }, [applications, opportunities, targetGoal]);

  // Recharts Bar Data: Progress Breakdown vs Goal
  const chartData = useMemo(() => {
    return [
      {
        category: 'Funding Capital (ZAR)',
        Secured: pipelineMetrics.approvedTotal,
        'Under Review': pipelineMetrics.underReviewTotal,
        Submitted: pipelineMetrics.submittedTotal,
        Draft: pipelineMetrics.draftTotal,
        'Remaining Goal': pipelineMetrics.remainingDeficit
      }
    ];
  }, [pipelineMetrics]);

  // Instrument Breakdown (Grants vs Loans vs Equity)
  const instrumentBreakdown = useMemo(() => {
    let grants = 0;
    let loans = 0;
    let equity = 0;

    applications.forEach(app => {
      const opp = opportunities.find(o => o.opportunity_id === app.opportunityId);
      const est = opp ? Math.round((opp.amount_min + opp.amount_max) / 2) : 150000;
      const type = String(app.type || opp?.funding_type || 'GRANT').toUpperCase();
      if (type.includes('GRANT')) grants += est;
      else if (type.includes('LOAN')) loans += est;
      else equity += est;
    });

    return { grants, loans, equity };
  }, [applications, opportunities]);

  const handleSaveGoal = async () => {
    const parsed = Number(tempGoalInput.replace(/[^0-9]/g, ''));
    if (!parsed || parsed <= 0) return;

    setIsSavingGoal(true);
    setCustomGoal(parsed);
    setIsEditingGoal(false);

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.id), {
          targetFundingGoal: parsed
        }, { merge: true });
      } catch (err) {
        console.error('Failed to save target goal:', err);
      } finally {
        setIsSavingGoal(false);
      }
    } else {
      setIsSavingGoal(false);
    }
  };

  const formatZAR = (val: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-7 relative overflow-hidden group w-full min-w-0 border border-white/10 flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 blur-[80px] pointer-events-none"></div>

      <div>
        {/* Header with Title & Goal Edit */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Target size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">Funding Goal Progress</h3>
            </div>
            <p className="text-xs text-gray-400">
              Active application pipeline vs. target capital goal
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isEditingGoal ? (
              <div className="flex items-center gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/15">
                <span className="text-xs font-bold text-gray-400 pl-2">R</span>
                <input 
                  type="text" 
                  value={tempGoalInput}
                  onChange={(e) => setTempGoalInput(e.target.value)}
                  placeholder="e.g. 1500000"
                  className="w-28 bg-transparent text-xs font-mono font-bold text-white focus:outline-none"
                  autoFocus
                />
                <button 
                  onClick={handleSaveGoal}
                  disabled={isSavingGoal}
                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  title="Save Goal"
                >
                  <Check size={13} />
                </button>
                <button 
                  onClick={() => setIsEditingGoal(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Cancel"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTempGoalInput(String(targetGoal));
                  setIsEditingGoal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition-all flex items-center gap-1.5"
                title="Edit funding target goal"
              >
                <Edit3 size={13} className="text-emerald-400" />
                <span>Target: <span className="font-mono text-white">{formatZAR(targetGoal)}</span></span>
              </button>
            )}
          </div>
        </div>

        {/* Big KPI Numbers Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 relative z-10">
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Target Goal</span>
            <p className="text-sm sm:text-base font-black font-mono text-white truncate">
              {formatZAR(targetGoal)}
            </p>
            <span className="text-[10px] text-gray-500 block truncate">
              {customGoal ? 'Custom set' : needsTotal > 0 ? 'From funding needs' : 'Benchmark'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Pipeline Value</span>
            <p className="text-sm sm:text-base font-black font-mono text-purple-400 truncate">
              {formatZAR(pipelineMetrics.activeAppliedTotal)}
            </p>
            <span className="text-[10px] text-purple-400/80 font-bold block truncate">
              {pipelineMetrics.progressPercent}% of target
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Secured / Won</span>
            <p className="text-sm sm:text-base font-black font-mono text-emerald-400 truncate">
              {formatZAR(pipelineMetrics.approvedTotal)}
            </p>
            <span className="text-[10px] text-emerald-400/80 font-bold block truncate">
              {pipelineMetrics.approvedPercent}% funded
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Remaining Deficit</span>
            <p className="text-sm sm:text-base font-black font-mono text-amber-400 truncate">
              {formatZAR(pipelineMetrics.remainingDeficit)}
            </p>
            <span className="text-[10px] text-amber-400/80 font-bold block truncate">
              To raise
            </span>
          </div>
        </div>

        {/* Recharts Stacked Horizontal Bar Visualization */}
        <div className="mb-6 relative z-10">
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <XAxis 
                  type="number" 
                  domain={[0, targetGoal]} 
                  tickFormatter={(val) => `R${(val / 1000).toFixed(0)}k`}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="category" hide />
                <Tooltip 
                  formatter={(value: any, name: any) => [formatZAR(Number(value) || 0), name]}
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
                <Bar dataKey="Secured" stackId="pipeline" fill="#10B981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Under Review" stackId="pipeline" fill="#F59E0B" />
                <Bar dataKey="Submitted" stackId="pipeline" fill="#3B82F6" />
                <Bar dataKey="Draft" stackId="pipeline" fill="#A855F7" />
                <Bar dataKey="Remaining Goal" stackId="pipeline" fill="rgba(255, 255, 255, 0.08)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Visual Legend */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/5 text-[11px] font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
              <span className="text-gray-300">Secured</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
              <span className="text-gray-300">Under Review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
              <span className="text-gray-300">Submitted</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 shrink-0" />
              <span className="text-gray-300">In Draft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-white/10 shrink-0" />
              <span className="text-gray-400">Uncovered Gap</span>
            </div>
          </div>
        </div>

        {/* Instrument Capital Allocation Strip */}
        <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 relative z-10">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-gray-400 flex items-center gap-1.5">
              <PieChart size={13} className="text-emerald-400" /> Pipeline by Instrument
            </span>
            <span className="text-[11px] text-gray-500 font-mono">
              {applications.length} applications total
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[9px] uppercase font-black text-emerald-400 block tracking-wider">Grants</span>
              <span className="text-xs font-mono font-bold text-white">{formatZAR(instrumentBreakdown.grants)}</span>
            </div>
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-[9px] uppercase font-black text-blue-400 block tracking-wider">Loans</span>
              <span className="text-xs font-mono font-bold text-white">{formatZAR(instrumentBreakdown.loans)}</span>
            </div>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <span className="text-[9px] uppercase font-black text-purple-400 block tracking-wider">Equity</span>
              <span className="text-xs font-mono font-bold text-white">{formatZAR(instrumentBreakdown.equity)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Navigation CTA */}
      <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs relative z-10">
        <span className="text-gray-500">
          {pipelineMetrics.progressPercent < 100 
            ? `${formatZAR(pipelineMetrics.remainingDeficit)} needed to reach full target` 
            : 'Goal achieved in active pipeline!'}
        </span>
        {onBrowseFunding && (
          <button 
            onClick={onBrowseFunding}
            className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center gap-1 group"
          >
            Find Matching Grants <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};

export default FundingAnalyticsSection;

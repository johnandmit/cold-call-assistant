import { CampaignMember } from '@/types';
import { 
  X, Phone, TrendingUp, Star, Calendar, 
  Activity, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  member: CampaignMember;
  onClose: () => void;
}

export default function MemberStatsModal({ member, onClose }: Props) {
  const successRate = member.total_calls > 0 
    ? Math.round(((member.success_count || 0) / member.total_calls) * 100) 
    : 0;

  const outcomeList = member.outcomes ? Object.entries(member.outcomes).sort((a, b) => b[1] - a[1]) : [];
  const maxOutcomeCount = Math.max(...outcomeList.map(o => o[1]), 1);

  const stats = [
    { label: 'Total Calls', value: member.total_calls, icon: Phone, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Success Rate', value: `${successRate}%`, icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Avg Rating', value: member.avg_rating || '0.0', icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Member Since', value: new Date(member.joined_at).toLocaleDateString(), icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-card w-full max-w-2xl overflow-hidden shadow-2xl border-primary/20"
      >
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
              {member.email.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">{member.email}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${member.role === 'owner' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'}`}>
                  {member.role === 'owner' ? 'ADMIN' : 'MEMBER'}
                </span>
                {member.last_active && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Last active {new Date(member.last_active).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <motion.div 
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 rounded-2xl bg-muted/40 border border-border/50"
              >
                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color} w-fit mb-3`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-xl font-black">{stat.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Outcome Distribution */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Outcome Distribution</h3>
            </div>
            
            <div className="space-y-4">
              {outcomeList.length > 0 ? (
                outcomeList.map(([outcome, count], i) => (
                  <motion.div 
                    key={outcome}
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ delay: 0.2 + (i * 0.1) }}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="capitalize">{outcome.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / maxOutcomeCount) * 100}%` }}
                        transition={{ delay: 0.4 + (i * 0.1), duration: 0.8, ease: "easeOut" }}
                        className={`h-full rounded-full ${
                          outcome.includes('success') || outcome.includes('Proposal') || outcome.includes('warm') 
                          ? 'bg-green-500' 
                          : outcome.includes('Follow') 
                          ? 'bg-blue-500' 
                          : 'bg-primary/40'
                        }`}
                      />
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="p-8 text-center bg-muted/20 rounded-2xl border border-dashed border-border flex flex-col items-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No outcome data available for this member yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Call Success vs Total Calls Comparison */}
          {member.total_calls > 0 && (
             <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-6">
                <div className="relative w-16 h-16 flex-shrink-0">
                   <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
                      <motion.circle 
                        cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" 
                        strokeDasharray={175.9}
                        initial={{ strokeDashoffset: 175.9 }}
                        animate={{ strokeDashoffset: 175.9 - (175.9 * successRate / 100) }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="text-green-500" 
                      />
                   </svg>
                   <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase">
                      {successRate}%
                   </div>
                </div>
                <div>
                   <h4 className="text-sm font-bold">Performance Summary</h4>
                   <p className="text-xs text-muted-foreground mt-1">
                      {member.success_count || 0} successful outcome{(member.success_count || 0) !== 1 ? 's' : ''} across {member.total_calls} monitored calls within this campaign.
                   </p>
                </div>
             </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-muted/30 border-t border-border flex justify-end">
           <button 
             onClick={onClose}
             className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
           >
             Close Insights
           </button>
        </div>
      </motion.div>
    </div>
  );
}

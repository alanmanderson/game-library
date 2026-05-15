import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Users, Coffee, DollarSign, Calendar, AlertTriangle, Trophy, ArrowRight } from 'lucide-react';
import type { SimulationSummary } from '@/types/game';
import { formatCurrency } from '@/utils/format';

interface SimulationSummaryModalProps {
  summary: SimulationSummary;
  isOpen: boolean;
  onClose: () => void;
}

export default function SimulationSummaryModal({ summary, isOpen, onClose }: SimulationSummaryModalProps) {
  const isProfitable = summary.totalProfit >= 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className={`px-6 py-5 ${isProfitable ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-xl">Simulation Summary</h2>
                  <div className="flex items-center gap-2 mt-1 text-white/90 text-sm">
                    <Calendar size={14} />
                    <span>
                      Days {summary.startDay} &ndash; {summary.endDay - 1} ({summary.daysSimulated} day{summary.daysSimulated === 1 ? '' : 's'}
                      {summary.stoppedEarly ? ` of ${summary.daysRequested}` : ''})
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                  aria-label="Close"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="px-6 py-5 overflow-y-auto">
              {/* Stopped early warning */}
              {summary.stoppedEarly && summary.stopReason && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <div className="font-semibold">Stopped early</div>
                    <div>{summary.stopReason}</div>
                  </div>
                </div>
              )}

              {/* Total profit / loss headline */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', damping: 10 }}
                className="text-center mb-5"
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  {isProfitable ? (
                    <TrendingUp size={28} className="text-green-500" />
                  ) : (
                    <TrendingDown size={28} className="text-red-500" />
                  )}
                </div>
                <div className={`text-3xl font-bold ${isProfitable ? 'text-green-600' : 'text-red-500'}`}>
                  {isProfitable ? '+' : ''}{formatCurrency(summary.totalProfit)}
                </div>
                <div className="text-sm text-ink-light mt-1">
                  {isProfitable ? 'Total Profit' : 'Total Loss'}
                </div>
                <div className="text-xs text-ink-light mt-2 flex items-center justify-center gap-1">
                  <span>{formatCurrency(summary.cashBefore)}</span>
                  <ArrowRight size={12} />
                  <span className="font-semibold">{formatCurrency(summary.cashAfter)}</span>
                </div>
              </motion.div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={14} className="text-green-600" />
                    <span className="text-xs font-medium text-green-600">Revenue</span>
                  </div>
                  <div className="font-bold text-green-800">{formatCurrency(summary.totalRevenue)}</div>
                </div>

                <div className="bg-red-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={14} className="text-red-500" />
                    <span className="text-xs font-medium text-red-500">Expenses</span>
                  </div>
                  <div className="font-bold text-red-700">{formatCurrency(summary.totalExpenses)}</div>
                </div>

                <div className="bg-blue-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={14} className="text-blue-600" />
                    <span className="text-xs font-medium text-blue-600">Customers</span>
                  </div>
                  <div className="font-bold text-blue-800">{summary.totalCustomers}</div>
                </div>

                <div className="bg-amber-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Coffee size={14} className="text-amber-600" />
                    <span className="text-xs font-medium text-amber-600">Cups Sold</span>
                  </div>
                  <div className="font-bold text-amber-800">{summary.totalCupsSold}</div>
                </div>
              </div>

              {/* New stage */}
              {summary.newStageReached && (
                <div className="mt-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-3">
                  <div className="text-xs font-semibold text-purple-700 mb-1">New Stage Reached!</div>
                  <div className="text-sm font-bold text-purple-900">{summary.newStageReached}</div>
                </div>
              )}

              {/* New achievements */}
              {summary.newAchievements.length > 0 && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy size={14} className="text-yellow-600" />
                    <span className="text-xs font-semibold text-yellow-700">
                      New Achievements ({summary.newAchievements.length})
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {summary.newAchievements.map((a) => (
                      <li key={a.id} className="text-sm text-yellow-900">
                        <span className="font-semibold">{a.name}</span>
                        <span className="text-yellow-700"> &mdash; {a.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key events timeline */}
              {summary.keyEvents.length > 0 && (
                <div className="mt-4 bg-purple-50 border border-purple-100 rounded-xl p-3">
                  <div className="text-xs font-semibold text-purple-700 mb-2">Events ({summary.keyEvents.length})</div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {summary.keyEvents.map((evt, i) => (
                      <li key={i} className="text-sm text-purple-900">{evt}</li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.keyEvents.length === 0 && summary.newAchievements.length === 0 && !summary.newStageReached && (
                <div className="mt-4 text-center text-sm text-ink-light italic">
                  No notable events occurred during the simulation.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 pt-3 border-t border-gray-100">
              <button
                onClick={onClose}
                className="btn-primary w-full"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

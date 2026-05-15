import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Users, Coffee, DollarSign, Cloud } from 'lucide-react';
import type { DayResult } from '@/types/game';
import { WeatherNames, WeatherIcons } from '@/types/game';
import { formatCurrency } from '@/utils/format';

interface DayResultModalProps {
  result: DayResult;
  isOpen: boolean;
  onClose: () => void;
}

export default function DayResultModal({ result, isOpen, onClose }: DayResultModalProps) {
  const profit = result.profit;
  const isProfitable = profit >= 0;

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
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className={`px-6 py-5 ${isProfitable ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-xl">Day {result.day} Results</h2>
                  <div className="flex items-center gap-2 mt-1 text-white/80 text-sm">
                    <Cloud size={14} />
                    <span>{WeatherIcons[result.weather]} {WeatherNames[result.weather]} - {result.temperature}&deg;F</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              {/* Profit / Loss headline */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring', damping: 10 }}
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
                  {isProfitable ? '+' : ''}{formatCurrency(profit)}
                </div>
                <div className="text-sm text-ink-light mt-1">
                  {isProfitable ? 'Net Profit' : 'Net Loss'}
                </div>
              </motion.div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-green-50 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={14} className="text-green-600" />
                    <span className="text-xs font-medium text-green-600">Revenue</span>
                  </div>
                  <div className="font-bold text-green-800">{formatCurrency(result.revenue)}</div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 }}
                  className="bg-red-50 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={14} className="text-red-500" />
                    <span className="text-xs font-medium text-red-500">Expenses</span>
                  </div>
                  <div className="font-bold text-red-700">{formatCurrency(result.expenses)}</div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-blue-50 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={14} className="text-blue-600" />
                    <span className="text-xs font-medium text-blue-600">Customers</span>
                  </div>
                  <div className="font-bold text-blue-800">{result.customerCount}</div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 }}
                  className="bg-amber-50 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Coffee size={14} className="text-amber-600" />
                    <span className="text-xs font-medium text-amber-600">Cups Sold</span>
                  </div>
                  <div className="font-bold text-amber-800">{result.cupsSold}</div>
                </motion.div>
              </div>

              {/* Satisfaction bar */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-ink">Customer Satisfaction</span>
                  <span className="text-sm font-bold text-ink">{result.customerSatisfaction.toFixed(0)}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, result.customerSatisfaction)}%` }}
                    transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${
                      result.customerSatisfaction > 70
                        ? 'bg-gradient-to-r from-green-400 to-green-500'
                        : result.customerSatisfaction > 40
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                        : 'bg-gradient-to-r from-red-400 to-red-500'
                    }`}
                  />
                </div>
              </motion.div>

              {/* Events */}
              {result.events && result.events.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="mt-4 bg-purple-50 border border-purple-100 rounded-xl p-3"
                >
                  <div className="text-xs font-semibold text-purple-600 mb-1">Events</div>
                  {result.events.map((evt, i) => (
                    <div key={i} className="text-sm text-purple-800">{evt}</div>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5">
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

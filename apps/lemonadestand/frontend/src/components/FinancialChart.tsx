import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { DayResult } from '@/types/game';

interface FinancialChartProps {
  dayResults: DayResult[];
}

export default function FinancialChart({ dayResults }: FinancialChartProps) {
  if (dayResults.length === 0) {
    return (
      <div className="game-card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink">Financial History</h3>
        </div>
        <div className="text-center py-8 text-ink-light text-sm">
          Complete a day to see your financial chart!
        </div>
      </div>
    );
  }

  const data = dayResults.map((r) => ({
    day: `Day ${r.day}`,
    Revenue: parseFloat(r.revenue.toFixed(2)),
    Expenses: parseFloat(r.expenses.toFixed(2)),
    Profit: parseFloat((r.revenue - r.expenses).toFixed(2)),
  }));

  return (
    <div className="game-card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={20} className="text-amber-600" />
        <h3 className="font-bold text-ink">Financial History</h3>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '10px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, undefined]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Area type="monotone" dataKey="Revenue" stroke="#10B981" fill="url(#colorRevenue)" strokeWidth={2} />
            <Area type="monotone" dataKey="Expenses" stroke="#EF4444" fill="url(#colorExpenses)" strokeWidth={2} />
            <Area type="monotone" dataKey="Profit" stroke="#3B82F6" fill="url(#colorProfit)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

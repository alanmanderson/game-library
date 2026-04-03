import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Loader2, Briefcase, Smile } from 'lucide-react';
import type { Employee } from '@/types/game';
import { EmployeeRoleNames } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';

interface EmployeePanelProps {
  employees: Employee[];
  gameId: string;
}

const HIRE_ROLES = [
  { role: 'Cashier', description: 'Handles transactions' },
  { role: 'Cook', description: 'Prepares lemonade' },
  { role: 'Manager', description: 'Improves efficiency' },
  { role: 'Marketer', description: 'Attracts more customers' },
];

export default function EmployeePanel({ employees, gameId }: EmployeePanelProps) {
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [showHire, setShowHire] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [hireName, setHireName] = useState('');
  const [hireRole, setHireRole] = useState('Cashier');

  const handleHire = async () => {
    if (!hireName.trim()) return;
    setHiring(true);
    try {
      const newState = await api.hireEmployee(gameId, { name: hireName.trim(), role: hireRole });
      setGame(newState);
      addToast({ type: 'success', title: 'Employee Hired!', message: `${hireName} joined as ${hireRole}.`, duration: 3000 });
      setHireName('');
      setShowHire(false);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not hire employee.', duration: 4000 });
    } finally {
      setHiring(false);
    }
  };

  return (
    <div className="game-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink">Employees</h3>
          <span className="text-xs text-ink-light bg-gray-100 rounded-full px-2 py-0.5">{employees.length}</span>
        </div>
        <button
          onClick={() => setShowHire(!showHire)}
          className="btn-secondary text-sm py-1.5 px-3"
        >
          <UserPlus size={14} />
          Hire
        </button>
      </div>

      {/* Hire form */}
      <AnimatePresence>
        {showHire && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 border border-green-100 bg-green-50 rounded-xl p-4 overflow-hidden"
          >
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Employee name..."
                value={hireName}
                onChange={(e) => setHireName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                maxLength={30}
              />
              <div className="grid grid-cols-2 gap-2">
                {HIRE_ROLES.map((r) => (
                  <button
                    key={r.role}
                    onClick={() => setHireRole(r.role)}
                    className={`text-left rounded-lg border p-2 text-xs transition-all ${
                      hireRole === r.role
                        ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
                        : 'border-gray-200 bg-white hover:border-amber-200'
                    }`}
                  >
                    <div className="font-bold">{r.role}</div>
                    <div className="text-ink-light">{r.description}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleHire}
                disabled={hiring || !hireName.trim()}
                className="btn-primary text-sm py-2"
              >
                {hiring ? <Loader2 className="animate-spin" size={14} /> : <UserPlus size={14} />}
                Hire {hireName || 'Employee'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Employee list */}
      {employees.length === 0 ? (
        <div className="text-center py-6 text-ink-light text-sm">
          No employees yet. Hire your first worker!
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 bg-gray-50 rounded-xl p-3"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-sm font-bold text-blue-700">
                {emp.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-ink truncate">{emp.name}</div>
                <div className="flex items-center gap-2 text-xs text-ink-light">
                  <Briefcase size={10} />
                  <span>{EmployeeRoleNames[emp.role] ?? 'Worker'}</span>
                  <span className="text-ink-lighter">|</span>
                  <span>{emp.daysEmployed}d</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold text-green-700">{formatCurrency(emp.wage)}/day</div>
                <div className="flex items-center gap-1 text-xs text-ink-light">
                  <Smile size={10} />
                  <span>{emp.satisfaction}%</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

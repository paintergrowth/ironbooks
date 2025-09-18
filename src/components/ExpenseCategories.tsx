// src/components/ExpenseCategories.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

//type UiTimeframe = 'This Month' | 'Last Month' | 'YTD';
type ApiPeriod = 'this_month' | 'last_month' | 'ytd';

function toApiPeriod(tf: UiTimeframe): ApiPeriod {
  if (tf === 'This Month') return 'this_month';
  if (tf === 'Last Month') return 'last_month';
  return 'ytd';
}

function fmt0(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function pctChange(curr: number, prev: number): number | null {
  if (!isFinite(curr) || !isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function changeLabel(period: ApiPeriod) {
  return period === 'ytd' ? 'from last year' : 'from last month';
}

interface CategoryRow {
  name: string;
  accountId?: string | null;
  current: number;
  previous: number;
  share: number; // 0..1 (of total current expenses)
}

interface CategoriesPayload {
  period: ApiPeriod;
  total: { current: number; previous: number };
  categories: CategoryRow[];
  lastSyncAt?: string;
}

interface TxnRow {
  date: string;
  type?: string;
  docnum?: string;
  name?: string;
  memo?: string;
  amount: number | string; // (server may send string; we coerce)
}

export default function ExpenseCategories({ timeframe }: { timeframe: ApiPeriod }) {

  const [loading, setLoading] = useState(false);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [totalCurr, setTotalCurr] = useState(0);
  const [period, setPeriod] = useState<ApiPeriod>(timeframe);

  // modal state
  const [open, setOpen] = useState(false);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [selected, setSelected] = useState<CategoryRow | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);

useEffect(() => { setPeriod(timeframe); }, [timeframe]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('qbo-expense-categories', {
          body: { period, nonce: Date.now() },
        });
        if (error) throw error;
        const payload = data as CategoriesPayload;
        if (!cancelled && payload) {
          setCats(Array.isArray(payload.categories) ? payload.categories : []);
          setTotalCurr(payload?.total?.current || 0);
        }
      } catch (e) {
        console.error('qbo-expense-categories error:', e);
        if (!cancelled) {
          setCats([]);
          setTotalCurr(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const periodChangeText = useMemo(() => changeLabel(period), [period]);

  const openDetails = async (row: CategoryRow) => {
    setSelected(row);
    setOpen(true);
    setLoadingTxns(true);
    try {
      const { data, error } = await supabase.functions.invoke('qbo-expense-transactions', {
        body: {
          period,
          accountId: row.accountId ?? undefined,
          accountName: row.name,
          nonce: Date.now(),
        },
      });
      if (error) throw error;
      // 🔧 Ensure amounts are numeric so sums are correct (esp. YTD)
      const coerced = Array.isArray(data?.transactions)
        ? data.transactions.map((t: TxnRow) => ({
            ...t,
            amount: Number((t as any).amount) || 0,
          }))
        : [];
      setTxns(coerced);
    } catch (e) {
      console.error('qbo-expense-transactions error:', e);
      setTxns([]);
    } finally {
      setLoadingTxns(false);
    }
  };

  const closeDetails = () => {
    setOpen(false);
    setSelected(null);
    setTxns([]);
  };

  // ✅ Sum the transactions actually shown (fixes YTD mismatch)
  const txnTotal = useMemo(
    () => txns.reduce((sum, t) => sum + (typeof t.amount === 'string' ? Number(t.amount) || 0 : (t.amount || 0)), 0),
    [txns]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Top Expense Categories <span className="text-sm text-gray-500">({period === 'ytd' ? 'YoY Change' : 'MoM Change'})</span>
        </h3>
        {loading ? <span className="text-xs text-gray-500">Loading…</span> : null}
      </div>

      {/* Grid of category cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cats.map((c) => {
          const delta = c.current - c.previous;
          const pct = pctChange(c.current, c.previous);
          const isUp = delta > 0;
          const barPct = Math.max(0, Math.min(100, (c.share || 0) * 100));
          return (
            <Card
              key={`${c.accountId || c.name}`}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openDetails(c)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900 dark:text-white">{c.name}</div>
                <div className="text-sm text-gray-500">{((c.share || 0) * 100).toFixed(1)}%</div>
              </div>

              {/* Bar = % of total expenses (current) */}
              <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-3">
                <div
                  className={`h-2 ${isUp ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>

              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmt0(c.current)}</div>
                <div className={`text-xs ${isUp ? 'text-red-600' : 'text-green-600'}`}>
                  {`${isUp ? '+' : '-'}${fmt0(Math.abs(delta))}`}
                  {pct !== null ? ` (${isUp ? '+' : '-'}${Math.abs(pct).toFixed(1)}%)` : ' (—)'}{' '}
                  {periodChangeText}
                </div>
              </div>
            </Card>
          );
        })}
        {!loading && cats.length === 0 && (
          <div className="text-sm text-gray-500 col-span-full">No expense data for this period.</div>
        )}
      </div>

      {/* Modal (simple, self-contained) */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-3xl rounded-xl shadow-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {selected?.name} — {timeframe}
                </h4>
                <p className="text-sm text-gray-500">
                  {/* 🔁 Use the *sum of visible txns* instead of aggregated category total */}
                  {fmt0(txnTotal)} total • {((selected?.share || 0) * 100).toFixed(1)}% of expenses
                </p>
              </div>
              <Button variant="outline" onClick={closeDetails}>Close</Button>
            </div>

            {loadingTxns ? (
              <div className="p-6 text-sm text-gray-500">Loading transactions…</div>
            ) : txns.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No transactions found for this category and period.</div>
            ) : (
              <div className="max-h-[60vh] overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Memo</th>
                      <th className="text-right px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{new Date(t.date).toLocaleDateString()}</td>
                        <td className="px-3 py-2">{t.type || '—'}</td>
                        <td className="px-3 py-2">{t.name || '—'}</td>
                        <td className="px-3 py-2">{t.memo || '—'}</td>
                        <td className="px-3 py-2 text-right">{fmt0(Number(t.amount) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

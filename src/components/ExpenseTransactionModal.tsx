// src/components/ExpenseTransactionModal.tsx
import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, FileDown, Receipt, User } from 'lucide-react';

type TxnRow = {
  id?: string;
  date: string;            // ISO string (YYYY-MM-DD)
  type?: string;           // e.g. 'Bill', 'Expense'
  docnum?: string;         // document number
  name?: string;           // vendor/customer name
  memo?: string;           // memo/description
  amount: number | string; // numeric-ish
  // (optional legacy fields)
  description?: string;    // maps to memo if present
  vendor?: string;         // maps to name if present
  status?: 'paid' | 'pending' | 'overdue'; // shown as a badge if present
};

interface ExpenseTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  timeframe: string;
  transactions: TxnRow[];
}

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);

const fmtDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const statusTone = (status?: string) => {
  switch (status) {
    case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const toNumber = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

const toCsv = (rows: TxnRow[]) => {
  const header = ['Date', 'Type', 'Doc #', 'Name', 'Memo', 'Amount'];
  const lines = rows.map(r => [
    r.date ?? '',
    r.type ?? '',
    r.docnum ?? '',
    r.name ?? r.vendor ?? '',
    r.memo ?? r.description ?? '',
    String(toNumber(r.amount)),
  ]);
  const csv = [header, ...lines]
    .map(cols => cols.map(cell => {
      const s = String(cell ?? '');
      // simple CSV escape
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
};

const ExpenseTransactionModal: React.FC<ExpenseTransactionModalProps> = ({
  isOpen,
  onClose,
  category,
  timeframe,
  transactions
}) => {
  const normalized = useMemo<TxnRow[]>(() => {
    // Normalize/clean the data so we can render consistently
    return (transactions || []).map((t, i) => ({
      ...t,
      id: t.id ?? `${t.date}-${t.docnum ?? ''}-${i}`,
      name: t.name ?? t.vendor ?? '—',
      memo: t.memo ?? t.description ?? '',
      amount: toNumber(t.amount),
    }));
  }, [transactions]);

  const totalAmount = useMemo(
    () => normalized.reduce((sum, t) => sum + toNumber(t.amount), 0),
    [normalized]
  );

  const exportCsv = () => {
    const blob = toCsv(normalized);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeCat = category.replace(/[^\w\d-_]+/g, '_').slice(0, 40) || 'transactions';
    link.download = `${safeCat}_${timeframe}.csv`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-xl">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {category} — Transactions ({timeframe})
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {normalized.length} txns
              </Badge>
              <Badge className="text-xs">
                Total: {fmtCurrency(totalAmount)}
              </Badge>
              <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1">
                <FileDown className="h-4 w-4" />
                CSV
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[68vh] rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/70 backdrop-blur supports-[backdrop-filter]:bg-gray-50/60 dark:supports-[backdrop-filter]:bg-gray-900/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Doc #</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Memo</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {normalized.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No transactions found for this category and period.
                  </td>
                </tr>
              ) : (
                normalized.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Receipt className="h-4 w-4 opacity-70" />
                        {t.type || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.docnum || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-4 w-4 opacity-70" />
                        {t.name || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{t.memo || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {fmtCurrency(toNumber(t.amount))}
                      {!!t.status && (
                        <span className="ml-2 align-middle">
                          <Badge className={`${statusTone(t.status)} text-[10px] uppercase`}>{t.status}</Badge>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {normalized.length > 0 && (
              <tfoot>
                <tr className="border-t bg-gray-50/70 dark:bg-gray-900/40">
                  <td className="px-3 py-2" colSpan={5}>
                    <span className="text-xs text-muted-foreground">Sum of amounts</span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseTransactionModal;

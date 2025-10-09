import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, DollarSign, Building } from 'lucide-react';

type ApiPeriod = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'ytd';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  vendor: string;
  status: 'paid' | 'pending' | 'overdue';
}

interface ExpenseTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  /** existing prop: still supported for preset labels; may be "ytd (custom)" in some flows */
  timeframe: string;
  transactions: Transaction[];

  /** Optional: pass these when using a custom range */
  mode?: 'preset' | 'custom';
  /** YYYY-MM-DD if mode==='custom' */
  rangeFrom?: string | null;
  /** YYYY-MM-DD if mode==='custom' */
  rangeTo?: string | null;
  /** Optional: explicit preset enum to override timeframe free text */
  preset?: ApiPeriod;
}

const ExpenseTransactionModal: React.FC<ExpenseTransactionModalProps> = ({
  isOpen,
  onClose,
  category,
  timeframe,
  transactions,
  mode,
  rangeFrom,
  rangeTo,
  preset,
}) => {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  // Header-friendly formatter: "1 Jan 2025"
  const formatHeaderDate = (yyyyMmDd: string) => {
    const d = new Date(`${yyyyMmDd}T00:00:00Z`);
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = d.getUTCFullYear();
    return `${day} ${month} ${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'overdue':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const totalAmount = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  // ----- Robust custom detection -----
  const timeframeLooksCustom = /\bcustom\b/i.test(timeframe || '');
  const hasRange = !!(rangeFrom && rangeTo);
  const isCustom = mode === 'custom' || hasRange || timeframeLooksCustom;

  // ----- Preset label when not custom -----
  const effectivePreset: ApiPeriod | null =
    preset ??
    (['this_month', 'last_month', 'this_quarter', 'last_quarter', 'ytd'].includes(
      (timeframe || '').toLowerCase()
    )
      ? ((timeframe as unknown) as ApiPeriod)
      : null);

  const presetLabel =
    effectivePreset === 'this_month'
      ? 'This Month'
      : effectivePreset === 'last_month'
      ? 'Last Month'
      : effectivePreset === 'this_quarter'
      ? 'This Quarter'
      : effectivePreset === 'last_quarter'
      ? 'Last Quarter'
      : effectivePreset === 'ytd'
      ? 'YTD'
      : timeframe; // fallback: whatever string was passed in

  // ----- Final heading suffix -----
  const headingSuffix = isCustom
    ? hasRange
      ? `(${formatHeaderDate(rangeFrom!)} ~ ${formatHeaderDate(rangeTo!)})`
      : '(Custom Range)'
    : presetLabel;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <DollarSign className="h-5 w-5" />
            {category} — {headingSuffix}
          </DialogTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{transactions.length} transactions</span>
            <span>Total: {formatCurrency(totalAmount)}</span>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] pr-2">
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {transaction.description}
                        </h4>
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Building className="h-4 w-4" />
                          {transaction.vendor}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(transaction.date)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-lg text-gray-900 dark:text-white">
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseTransactionModal;

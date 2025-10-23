// src/components/CurrentPosition.tsx
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { invokeWithAuthSafe } from '@/lib/supabase';
import { useEffectiveIdentity } from '@/lib/impersonation';
import clsx from 'clsx';

type Props = {
  realmId: string;
  className?: string;
};

type CurrentPositionPayload = {
  bank?: number;
  cash?: number;
  receivables?: number;
  asOf?: string | null;
  companyName?: string | null;
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const CurrentPosition: React.FC<Props> = ({ realmId, className }) => {
  const { toast } = useToast();
  const { userId: effUserId } = useEffectiveIdentity();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CurrentPositionPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setErr(null);
      setData(null);

      // 🔒 Don’t call until we have both IDs
      if (!realmId || !effUserId) return;

      setLoading(true);
      try {
        const { data, error } = await invokeWithAuthSafe<CurrentPositionPayload>('qbo-current-position', {
          body: { realmId, userId: effUserId, nonce: Date.now() }, // ✅ non-empty body
        });

        if (error) {
          if (!cancelled) {
            setErr(error.message || 'Failed to fetch current position.');
            // Optional: toast for visibility
            // toast({ title: 'Current Position', description: error.message || 'Unauthorized', variant: 'destructive' });
          }
          return;
        }

        if (!cancelled) setData(data ?? null);
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || 'Unexpected error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [realmId, effUserId]);

  return (
    <Card className={clsx('bg-card border border-border/20 shadow-sm', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold text-foreground">Current Position</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="text-sm text-muted-foreground">Loading current balances…</div>}

        {!loading && err && (
          <div className="text-sm text-red-600">
            {err.includes('401') ? 'Unauthorized — please reconnect QuickBooks.' : err}
          </div>
        )}

        {!loading && !err && data && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border/30 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank</p>
              <p className="text-lg font-semibold">{formatCurrency(Number(data.bank || 0))}</p>
            </div>
            <div className="rounded-md border border-border/30 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">Cash on Hand</p>
              <p className="text-lg font-semibold">{formatCurrency(Number(data.cash || 0))}</p>
            </div>
            <div className="rounded-md border border-border/30 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">Receivables</p>
              <p className="text-lg font-semibold">{formatCurrency(Number(data.receivables || 0))}</p>
            </div>
          </div>
        )}

        {!loading && !err && !data && (
          <div className="text-sm text-muted-foreground">No data yet.</div>
        )}

        {!loading && data?.asOf && (
          <p className="text-xs text-muted-foreground">As of {new Date(data.asOf).toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CurrentPosition;

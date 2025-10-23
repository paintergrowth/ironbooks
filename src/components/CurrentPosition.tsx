// src/components/CurrentPosition.tsx
import React, { useEffect, useRef, useState } from 'react';
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

  const triedOnce = useRef(false);

  const fetchPosition = async () => {
    setErr(null);
    // Do not wipe previous good data while loading, keeps UI stable
    if (!realmId || !effUserId) return;

    setLoading(true);
    try {
      const { data, error }: { data?: CurrentPositionPayload | null; error?: any } =
        await invokeWithAuthSafe<CurrentPositionPayload>('qbo-current-position', {
          body: { realmId, userId: effUserId, nonce: Date.now() },
          headers: {
            // help the function resolve identity/realm deterministically
            'x-ib-act-as-user': effUserId,
            'x-ib-act-as-realm': realmId,
            'content-type': 'application/json',
          },
        });

      if (error) {
        // Surface status/message if present
        const msg = error?.message || error?.error || 'Failed to fetch current position.';
        const status = error?.status ?? error?.statusCode ?? '';
        const text = status ? `${msg} (HTTP ${status})` : msg;
        setErr(text);
        console.warn('[CurrentPosition] invoke error:', error);
        return;
      }

      setData(data ?? null);
    } catch (e: any) {
      console.error('[CurrentPosition] unexpected:', e);
      setErr(e?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // run once when both IDs are available
    if (!realmId || !effUserId) return;
    fetchPosition().then(async () => {
      // quick one-time retry (helps just-after-login / just-after-impersonation)
      if (!triedOnce.current && (err || !data)) {
        triedOnce.current = true;
        await new Promise((r) => setTimeout(r, 600));
        await fetchPosition();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {/* normalize common 401s */}
            {/\b401\b|unauthor/i.test(err)
              ? 'Unauthorized — please reconnect QuickBooks (or token missing for this realm).'
              : err}
          </div>
        )}

        {!err && (data ? (
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
        ) : (
          !loading && <div className="text-sm text-muted-foreground">No data yet.</div>
        ))}

        {!loading && data?.asOf && (
          <p className="text-xs text-muted-foreground">As of {new Date(data.asOf).toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CurrentPosition;

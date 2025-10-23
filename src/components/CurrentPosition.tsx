// src/components/CurrentPosition.tsx
// Displays "Current Position" with three tiles: Bank, Cash on Hand, Receivables.
// Fetches from supabase edge function /qbo-current-position
// Sends impersonation headers so the server scopes to logged-in or impersonated realm.

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

import { useEffectiveIdentity } from "@/lib/impersonation";
import { Banknote, Wallet, ReceiptText } from "lucide-react";

type CurrPos = {
  bankTotal: number;
  cashOnHandTotal: number;
  receivablesTotal: number;
  asOf: string;
  realmId?: string;
  actAsUser?: string;
};

export default function CurrentPosition({
  realmId,
  className = "",
}: {
  realmId: string | null;
  className?: string;
}) {
  const { toast } = useToast();
  const { effectiveUserId, effectiveRealmId } = useEffectiveIdentity();

  const [data, setData] = useState<CurrPos | null>(null);
  const [loading, setLoading] = useState(true);

  // src/components/CurrentPosition.tsx (replace the effect that fetches data)
useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      if (!realmId && !effectiveRealmId) throw new Error("No realm selected.");
      const finalRealm = effectiveRealmId ?? realmId!;

      // 👉 Call the Edge Function via supabase.functions.invoke (POST)
      const { data, error } = await supabase.functions.invoke("qbo-current-position", {
        headers: {
          "Content-Type": "application/json",
          "x-ib-act-as-user": effectiveUserId ?? "",
          "x-ib-act-as-realm": finalRealm,
        },
        body: { realmId: finalRealm }, // POST body
      });

      if (error) throw error;
      if (mounted) setData(data as CurrPos);
    } catch (e: any) {
      toast({
        title: "Couldn’t load Current Position",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      if (mounted) setLoading(false);
    }
  })();
  return () => {
    mounted = false;
  };
}, [realmId, effectiveUserId, effectiveRealmId]);



  const fmt = (n?: number) =>
    typeof n === "number"
      ? n.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })
      : "—";

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Current Position</CardTitle>
          <Badge variant="secondary">Current</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border p-4">
                <div className="h-4 w-28 bg-muted animate-pulse rounded mb-3" />
                <div className="h-8 w-40 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl">Current Position</CardTitle>
        <Badge variant="secondary">Current</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tile
            title="Bank"
            value={fmt(data?.bankTotal)}
            icon={<Banknote className="h-5 w-5" aria-hidden />}
            sub={data?.asOf ? `As of ${new Date(data.asOf).toLocaleString()}` : "—"}
          />
          <Tile
            title="Cash on Hand"
            value={fmt(data?.cashOnHandTotal)}
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            sub={data?.asOf ? `As of ${new Date(data.asOf).toLocaleString()}` : "—"}
          />
          <Tile
            title="Receivables"
            value={fmt(data?.receivablesTotal)}
            icon={<ReceiptText className="h-5 w-5" aria-hidden />}
            sub={data?.asOf ? `As of ${new Date(data.asOf).toLocaleString()}` : "—"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  title,
  value,
  icon,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border p-4 bg-background">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold leading-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

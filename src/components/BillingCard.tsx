// src/components/BillingCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, ArrowRight, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Plan = "Iron" | "Gold" | "Platinum";
type SubStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | string;

interface ProfileSettings {
  subscription?: {
    status?: SubStatus;
    price_id?: string | null;
    plan?: string | null;
    trial_end?: number | null; // unix seconds
    current_period_end?: number | null; // unix seconds
    updated_at?: string;
  };
  [k: string]: unknown;
}

interface ProfileRow {
  plan: string; // 'No Subscription' | 'Iron' | 'Gold' | 'Platinum'
  settings: ProfileSettings | null;
}

function fmtUnixDate(ts?: number | null) {
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toLocaleDateString();
  } catch {
    return null;
  }
}

function statusBadgeVariant(status?: SubStatus) {
  switch (status) {
    case "active":
      return "default" as const;
    case "trialing":
      return "secondary" as const;
    case "past_due":
    case "unpaid":
    case "canceled":
    case "paused":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export const BillingCard: React.FC = () => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [invoking, setInvoking] = useState<"checkout" | "portal" | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>("Iron");

  const status = profile?.settings?.subscription?.status as SubStatus | undefined;
  const trialEnd = profile?.settings?.subscription?.trial_end ?? null;
  const currentPeriodEnd = profile?.settings?.subscription?.current_period_end ?? null;

  const hasSubscription = useMemo(() => {
    return status === "trialing" || status === "active";
  }, [status]);

  const readableStatus = useMemo(() => {
    if (!status) return "none";
    return status.replaceAll("_", " ");
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) {
          throw new Error("Not signed in");
        }
        const userId = userData.user.id;
        const { data, error } = await supabase
          .from("profiles")
          .select("plan, settings")
          .eq("id", userId)
          .single<ProfileRow>();
        if (error) throw error;
        if (!cancelled) {
          setProfile(data);
          // default plan select to current plan if valid
          if (data?.plan === "Iron" || data?.plan === "Gold" || data?.plan === "Platinum") {
            setSelectedPlan(data.plan as Plan);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: "Billing status",
            description: e?.message ?? "Failed to load billing status",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function startOrChangePlan() {
    try {
      setInvoking("checkout");
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { plan: selectedPlan },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e: any) {
      toast({
        title: "Checkout error",
        description: e?.message ?? "Could not start checkout",
        variant: "destructive",
      });
    } finally {
      setInvoking(null);
    }
  }

  async function openBillingPortal() {
    try {
      setInvoking("portal");
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("No billing portal URL returned");
      window.location.href = url;
    } catch (e: any) {
      toast({
        title: "Portal error",
        description: e?.message ?? "Could not open billing portal",
        variant: "destructive",
      });
    } finally {
      setInvoking(null);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle>Billing</CardTitle>
          {loading ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              loading…
            </Badge>
          ) : (
            <Badge variant={statusBadgeVariant(status)} className="capitalize">
              {hasSubscription ? profile?.plan : "No Subscription"} • {readableStatus}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Choose plan</label>
          <Select
            value={selectedPlan}
            onValueChange={(v) => setSelectedPlan(v as Plan)}
            disabled={invoking !== null}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Iron">Iron — $197/mo (App only)</SelectItem>
              <SelectItem value="Gold">Gold — $497/mo (App + DFY Bookkeeping)</SelectItem>
              <SelectItem value="Platinum">Platinum — $997/mo (App + DFY + Fractional CFO)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            New subscriptions start with a <strong>15-day free trial</strong> (card required). First charge occurs at the end of the trial.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={startOrChangePlan}
            disabled={invoking !== null}
            className="w-full"
          >
            {invoking === "checkout" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting…
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {hasSubscription ? "Change plan" : "Start 15-day trial"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={openBillingPortal}
            disabled={invoking !== null}
            className="w-full"
          >
            {invoking === "portal" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening…
              </>
            ) : (
              <>
                <Settings2 className="mr-2 h-4 w-4" />
                Manage billing
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          {status === "trialing" && (
            <div>
              Trial ends: <span className="font-medium">{fmtUnixDate(trialEnd) ?? "—"}</span>
            </div>
          )}
          {status === "active" && (
            <div>
              Next bill date: <span className="font-medium">{fmtUnixDate(currentPeriodEnd) ?? "—"}</span>
            </div>
          )}
          {!hasSubscription && <div>No active subscription.</div>}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted-foreground">
          Need to update card or cancel? Use <em>Manage billing</em> to open the Stripe Customer Portal.
        </p>
      </CardFooter>
    </Card>
  );
};

export default BillingCard;

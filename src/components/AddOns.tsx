import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, TrendingUp, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Plan = "Iron" | "Gold" | "Platinum";

const AddOns: React.FC = () => {
  const { toast } = useToast();
  const [invoking, setInvoking] = useState<Plan | null>(null);

  const packages = useMemo(
    () => [
      {
        id: "tier-1",
        tierLabel: "Tier 1",
        plan: "Iron" as Plan,
        title: "Essentials Bookkeeping",
        priceLabel: "$247 per month",
        meta: ["12-Month Commitment Required", "Revenue Cap: $25,000 per Month"],
        blurb: "Designed as a subsidized, entry-level program for early-stage businesses.",
        includes: [
          "Cash-basis bookkeeping",
          "Bank and credit card reconciliations",
          "Payroll sync and financial categorization",
          "Monthly financial reporting (Profit & Loss, Balance Sheet)",
          "AI-generated monthly financial summaries with clear, digestible insights",
          "App access (QuickBooks Online and IronBooks dashboards)",
          "Weekly group coaching call focused on profitability strategies",
          "Email support (responses within 2 business days)",
          "One structured onboarding & first month-end review call (30 minutes)",
        ],
        icon: Shield,
        popular: false,
        buttonText: "Buy Tier 1 - $247/Mo",
      },
      {
        id: "tier-2",
        tierLabel: "Tier 2",
        plan: "Gold" as Plan,
        title: "Growth Bookkeeping",
        priceLabel: "$497 per month",
        meta: ["12-Month Commitment Required"],
        blurb: "Built for growing businesses that need stronger structure, accuracy, and responsiveness.",
        includes: [
          "Accrual-basis accounting",
          "Everything in Tier 1, plus:",
          "Receipt capture and document management",
          "Enhanced categorization and month-end review",
          "Priority email support (responses within 1 business day)",
          "One structured onboarding & first month-end review call (60 minutes)",
          "Weekly group coaching call (same structure as Tier 1, segmented by revenue level)",
          "Clients attend one of two weekly calls:",
          "• Businesses under $1M in annual revenue",
          "• Businesses over $1M in annual revenue",
        ],
        icon: TrendingUp,
        popular: false,
        buttonText: "Buy Tier 2 - $497/Mo",
      },
      {
        id: "tier-3",
        tierLabel: "Tier 3",
        plan: "Platinum" as Plan,
        title: "CFO Advisory",
        priceLabel: "$997 per month",
        meta: ["12-Month Commitment Required"],
        blurb: "Designed for owners who want proactive financial leadership and strategic guidance.",
        includes: [
          "Everything in Tier 2, plus:",
          "One (1) 60-minute CFO advisory session per month focused on:",
          "• Profitability optimization",
          "• Cash flow planning and forecasting",
          "• Strategic decision-making",
          "Prioritized month-end close",
          "Priority SMS support",
          "Add-on services or custom projects will be scoped and billed separately.",
        ],
        icon: Crown,
        popular: true,
        buttonText: "Buy Tier 3 - $997/Mo",
      },
    ],
    []
  );

  async function startCheckout(plan: Plan) {
    try {
      setInvoking(plan);
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { plan },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (error) throw error;

      const url = (data as any)?.url;
      if (!url) throw new Error("No checkout URL returned");

      // Same behavior as BillingCard
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Packages</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Choose the tier that matches your current stage — and upgrade anytime as you grow.
        </p>
      </div>

      {/* Packages Grid */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 mb-16">
        {packages.map((pkg) => {
          const Icon = pkg.icon;
          return (
            <Card
              key={pkg.id}
              className="relative h-full hover:shadow-lg transition-shadow duration-300 border-0 shadow-md"
            >
              {pkg.popular && (
                <Badge className="absolute -top-3 -right-3 bg-success text-white px-3 py-1 text-sm font-semibold shadow-md z-10">
                  Most Popular
                </Badge>
              )}

              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <div className="p-2 bg-primary/10 dark:bg-primary/20 rounded-lg mr-3">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                      {pkg.tierLabel} — {pkg.title}
                    </CardTitle>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{pkg.priceLabel}</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-1">
                    {pkg.meta.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{pkg.blurb}</p>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="border-t dark:border-gray-700 pt-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Includes:</p>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                      {pkg.includes.map((item, idx) => (
                        <li key={`${pkg.id}-${idx}`} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 text-base shadow-sm"
                    onClick={() => startCheckout(pkg.plan)}
                    disabled={invoking !== null}
                  >
                    {invoking === pkg.plan ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      pkg.buttonText
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    New subscriptions start with a <strong>15-day free trial</strong> (card required). First charge occurs at the end of the trial.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Consultation Section */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-8 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Not sure which tier fits?</h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
            Book a free consultation and we’ll recommend the best package based on your goals and current numbers.
          </p>

          <a
            href="https://api.leadconnectorhq.com/widget/bookings/45mins-profit-xray-call"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="lg"
              className="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 font-semibold px-8 py-3 text-base"
            >
              👉 Book a Free Consultation
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
};

export default AddOns;

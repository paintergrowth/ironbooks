import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';

interface QuickPulseProps {
  period: 'this_month' | 'last_month' | 'ytd';
  metrics: {
    revenue_mtd: number;
    expenses_mtd: number;
    net_margin_pct: number;
    revenue_change?: number;
    expense_change?: number;
    margin_change?: number;
  };
}

interface Insight {
  type: 'positive' | 'negative' | 'neutral' | 'warning';
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

export function QuickPulse({ period, metrics }: QuickPulseProps) {
  const generateInsights = (): Insight[] => {
    const insights: Insight[] = [];
    
    // Revenue trend insight
    if (metrics.revenue_change !== undefined) {
      if (metrics.revenue_change > 10) {
        insights.push({
          type: 'positive',
          icon: <TrendingUp className="w-4 h-4" />,
          title: 'Strong Revenue Growth',
          description: `Revenue increased by ${metrics.revenue_change.toFixed(1)}% compared to previous period`,
          badge: `+${metrics.revenue_change.toFixed(1)}%`
        });
      } else if (metrics.revenue_change < -10) {
        insights.push({
          type: 'negative',
          icon: <TrendingDown className="w-4 h-4" />,
          title: 'Revenue Decline',
          description: `Revenue decreased by ${Math.abs(metrics.revenue_change).toFixed(1)}% - review sales pipeline`,
          badge: `${metrics.revenue_change.toFixed(1)}%`
        });
      }
    }

    // Margin health insight
    if (metrics.net_margin_pct > 25) {
      insights.push({
        type: 'positive',
        icon: <CheckCircle className="w-4 h-4" />,
        title: 'Healthy Profit Margins',
        description: `Net margin of ${metrics.net_margin_pct.toFixed(1)}% indicates strong operational efficiency`,
        badge: `${metrics.net_margin_pct.toFixed(1)}%`
      });
    } else if (metrics.net_margin_pct < 10) {
      insights.push({
        type: 'warning',
        icon: <AlertTriangle className="w-4 h-4" />,
        title: 'Low Profit Margins',
        description: `Net margin of ${metrics.net_margin_pct.toFixed(1)}% suggests need for cost optimization`,
        badge: `${metrics.net_margin_pct.toFixed(1)}%`
      });
    }

    // Expense trend insight
    if (metrics.expense_change !== undefined && metrics.expense_change > 15) {
      insights.push({
        type: 'warning',
        icon: <TrendingUp className="w-4 h-4" />,
        title: 'Rising Expenses',
        description: `Expenses increased by ${metrics.expense_change.toFixed(1)}% - monitor cost controls`,
        badge: `+${metrics.expense_change.toFixed(1)}%`
      });
    }

    return insights.slice(0, 3); // Show max 3 insights
  };

  const insights = generateInsights();

  if (insights.length === 0) {
    return null;
  }

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'positive': return 'default';
      case 'negative': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'outline';
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'positive': return 'text-green-600';
      case 'negative': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick Pulse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {insights.map((insight, index) => (
          <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className={`mt-0.5 ${getIconColor(insight.type)}`}>
              {insight.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm">{insight.title}</h4>
                {insight.badge && (
                  <Badge variant={getBadgeVariant(insight.type)} className="text-xs">
                    {insight.badge}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {insight.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
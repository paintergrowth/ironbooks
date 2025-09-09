import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
  margin?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  change, 
  icon: Icon,
  trend = 'neutral',
  onClick,
  margin
}) => {
  const trendColor = {
    up: 'text-success',
    down: 'text-destructive',
    neutral: 'text-muted-foreground'
  }[trend];

  const iconBgColor = {
    up: 'bg-success/10 text-success dark:bg-success/20',
    down: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
    neutral: 'bg-primary/10 text-primary dark:bg-primary/20'
  }[trend];

  return (
    <Card 
      className={`border-2 shadow-lg hover:shadow-xl transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-primary/50 hover:scale-[1.02] active:scale-[0.98]' : ''
      }`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          {title}
          {onClick && <span className="ml-1 text-xs opacity-60">→</span>}
        </CardTitle>
        <div className={`p-2 rounded-full ${iconBgColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{value}</div>
        {margin && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Margin: {margin}
          </div>
        )}
        {change && (
          <p className={`text-sm font-medium ${trendColor}`}>
            {change}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default MetricCard;
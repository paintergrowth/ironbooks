import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, Activity, Clock, Link, AlertTriangle, TrendingUp 
} from 'lucide-react';

interface AdminKPICardsProps {
  stats: {
    totalUsers: number;
    activeUsers: number;
    trialsExpiring: number;
    noQBO: number;
    errors24h: number;
    usersDelta7d: number;
    activeDelta7d: number;
  };
  onCardClick: (filter: string) => void;
}

const AdminKPICards: React.FC<AdminKPICardsProps> = ({ stats, onCardClick }) => {
  const cards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      delta: stats.usersDelta7d,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      filter: 'all',
      actionText: 'View All'
    },
    {
      title: 'Active Users',
      value: stats.activeUsers,
      delta: stats.activeDelta7d,
      icon: Activity,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      filter: 'active',
      actionText: 'View Active'
    },
    {
      title: 'Trials Expiring',
      value: stats.trialsExpiring,
      delta: null,
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      filter: 'trial',
      actionText: 'View Trials'
    },
    {
      title: 'No QBO Connected',
      value: stats.noQBO,
      delta: null,
      icon: Link,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      filter: 'noQBO',
      actionText: 'Fix Now'
    },
    {
      title: 'Errors (24h)',
      value: stats.errors24h,
      delta: null,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      filter: 'errors',
      actionText: 'See Logs'
    }
  ];

  const formatDelta = (delta: number | null) => {
    if (delta === null) return null;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta} (7d)`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
                {card.delta !== null && (
                  <div className="flex items-center text-xs text-gray-500">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {formatDelta(card.delta)}
                  </div>
                )}
              </div>
              
              <div className="mt-3">
                <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
                <p className="text-sm text-gray-600 mb-2">{card.title}</p>
                
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full text-xs"
                  onClick={() => onCardClick(card.filter)}
                >
                  {card.actionText}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AdminKPICards;
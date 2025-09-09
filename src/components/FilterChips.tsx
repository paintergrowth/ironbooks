import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, XCircle, UserX, Link, TrendingUp, 
  Clock, CreditCard, X 
} from 'lucide-react';

interface FilterChipsProps {
  activeFilters: string[];
  onFilterToggle: (filter: string) => void;
  onClearAll: () => void;
  counts: {
    active: number;
    suspended: number;
    neverLoggedIn: number;
    noQBO: number;
    highUsage: number;
    trial: number;
    pastDue: number;
  };
}

const FilterChips: React.FC<FilterChipsProps> = ({
  activeFilters,
  onFilterToggle,
  onClearAll,
  counts
}) => {
  const filters = [
    { 
      key: 'active', 
      label: 'Active', 
      icon: CheckCircle, 
      color: 'bg-green-100 text-green-800 hover:bg-green-200',
      count: counts.active 
    },
    { 
      key: 'suspended', 
      label: 'Suspended', 
      icon: XCircle, 
      color: 'bg-red-100 text-red-800 hover:bg-red-200',
      count: counts.suspended 
    },
    { 
      key: 'neverLoggedIn', 
      label: 'Never logged in', 
      icon: UserX, 
      color: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
      count: counts.neverLoggedIn 
    },
    { 
      key: 'noQBO', 
      label: 'No QBO', 
      icon: Link, 
      color: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
      count: counts.noQBO 
    },
    { 
      key: 'highUsage', 
      label: 'High CFO usage', 
      icon: TrendingUp, 
      color: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
      count: counts.highUsage 
    },
    { 
      key: 'trial', 
      label: 'Trial', 
      icon: Clock, 
      color: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
      count: counts.trial 
    },
    { 
      key: 'pastDue', 
      label: 'Past due', 
      icon: CreditCard, 
      color: 'bg-red-100 text-red-800 hover:bg-red-200',
      count: counts.pastDue 
    }
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 p-4 bg-gray-50 rounded-lg">
      <span className="text-sm font-medium text-gray-700 mr-2">Filters:</span>
      
      {filters.map((filter) => {
        const Icon = filter.icon;
        const isActive = activeFilters.includes(filter.key);
        
        return (
          <Badge
            key={filter.key}
            variant={isActive ? "default" : "outline"}
            className={`cursor-pointer transition-colors ${
              isActive 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : filter.color
            }`}
            onClick={() => onFilterToggle(filter.key)}
          >
            <Icon className="w-3 h-3 mr-1" />
            {filter.label}
            <span className="ml-1 text-xs">({filter.count})</span>
          </Badge>
        );
      })}
      
      {activeFilters.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearAll}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          <X className="w-3 h-3 mr-1" />
          Clear all
        </Button>
      )}
    </div>
  );
};

export default FilterChips;
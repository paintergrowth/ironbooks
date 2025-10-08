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
    { key: 'active',        label: 'Active',           icon: CheckCircle, count: counts.active },
    { key: 'suspended',     label: 'Suspended',        icon: XCircle,     count: counts.suspended },
    { key: 'neverLoggedIn', label: 'Never logged in',  icon: UserX,       count: counts.neverLoggedIn },
    { key: 'noQBO',         label: 'No QBO',           icon: Link,        count: counts.noQBO },
    { key: 'highUsage',     label: 'High CFO usage',   icon: TrendingUp,  count: counts.highUsage },
    { key: 'trial',         label: 'Trial',            icon: Clock,       count: counts.trial },
    { key: 'pastDue',       label: 'Past due',         icon: CreditCard,  count: counts.pastDue },
  ] as const;

  // Subtle, theme-aware hues for INACTIVE chips
  const inactiveClasses: Record<string, string> = {
    active:
      'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 ' +
      'dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/30',
    suspended:
      'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 ' +
      'dark:bg-red-900/20 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/30',
    neverLoggedIn:
      'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 ' +
      'dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',
    noQBO:
      'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 ' +
      'dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-900/30',
    highUsage:
      'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 ' +
      'dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-900/30',
    trial:
      'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 ' +
      'dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/30',
    pastDue:
      'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 ' +
      'dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-900/30',
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30 text-foreground
                    dark:bg-slate-900/60 dark:border-slate-700">
      <span className="text-sm font-medium text-muted-foreground mr-2">Filters:</span>

      {filters.map((filter) => {
        const Icon = filter.icon;
        const isActive = activeFilters.includes(filter.key);

        return (
          <Badge
            key={filter.key}
            variant={isActive ? 'default' : 'outline'}
            onClick={() => onFilterToggle(filter.key)}
            className={
              'cursor-pointer select-none transition-colors h-8 rounded-full px-3 py-1 text-sm flex items-center ' +
              (isActive
                // ACTIVE chip: invert using theme tokens for perfect contrast
                ? 'bg-foreground text-background hover:bg-foreground/90 border border-transparent'
                // INACTIVE chip: soft, theme-aware hues
                : inactiveClasses[filter.key])
            }
          >
            <Icon className="w-3.5 h-3.5 mr-1.5" />
            {filter.label}
            <span className="ml-1 text-xs opacity-80">({filter.count})</span>
          </Badge>
        );
      })}

      {activeFilters.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Clear all
        </Button>
      )}
    </div>
  );
};

export default FilterChips;

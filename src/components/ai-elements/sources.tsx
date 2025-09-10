// src/components/ai-elements/sources.tsx
import React, { useState } from 'react';
import { ExternalLink, FileText, Database, Calendar, ChevronDown, ChevronRight, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Source {
  id: string;
  title: string;
  type: 'quickbooks' | 'document' | 'calculation' | 'api' | 'report';
  url?: string;
  description?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

interface SourcesProps {
  sources: Source[];
  isVisible?: boolean;
  className?: string;
}

const SourceIcon = ({ type }: { type: Source['type'] }) => {
  switch (type) {
    case 'quickbooks':
      return <Database className="w-4 h-4 text-green-600" />;
    case 'document':
      return <FileText className="w-4 h-4 text-blue-600" />;
    case 'calculation':
      return <div className="w-4 h-4 rounded bg-purple-600 flex items-center justify-center text-xs text-white font-bold">Σ</div>;
    case 'api':
      return <LinkIcon className="w-4 h-4 text-orange-600" />;
    case 'report':
      return <Calendar className="w-4 h-4 text-indigo-600" />;
    default:
      return <FileText className="w-4 h-4 text-gray-600" />;
  }
};

export const Sources: React.FC<SourcesProps> = ({ 
  sources, 
  isVisible = true, 
  className 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isVisible || sources.length === 0) return null;

  return (
    <div className={cn("border rounded-lg bg-muted/20 overflow-hidden", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Sources ({sources.length})
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      
      {isExpanded && (
        <div className="border-t bg-background/30">
          <div className="p-3 space-y-2">
            {sources.map((source) => (
              <div 
                key={source.id}
                className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 transition-colors"
              >
                <SourceIcon type={source.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">{source.title}</h4>
                    {source.url && (
                      <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  {source.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {source.description}
                    </p>
                  )}
                  {source.metadata && (
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {source.metadata.dateRange && (
                        <span>📅 {source.metadata.dateRange}</span>
                      )}
                      {source.metadata.recordCount && (
                        <span>📊 {source.metadata.recordCount} records</span>
                      )}
                      {source.metadata.accuracy && (
                        <span>✓ {source.metadata.accuracy}% accuracy</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Hook to generate dummy sources based on query context
export const useDummySources = (query: string): Source[] => {
  const generateSources = (query: string): Source[] => {
    const baseTime = new Date();
    
    if (query.toLowerCase().includes('expense')) {
      return [
        {
          id: '1',
          title: 'QuickBooks Online - Expense Transactions',
          type: 'quickbooks',
          description: 'Retrieved expense data from your QuickBooks Online account for the specified period.',
          metadata: {
            dateRange: 'Jan 2024 - Dec 2024',
            recordCount: 1847,
            accuracy: 99.8
          }
        },
        {
          id: '2',
          title: 'Expense Category Analysis',
          type: 'calculation',
          description: 'Calculated expense totals and percentage changes by category.',
          metadata: {
            recordCount: 12
          }
        },
        {
          id: '3',
          title: 'Industry Benchmark Data',
          type: 'api',
          description: 'Compared your expenses against industry averages for small businesses.',
          metadata: {
            accuracy: 95.2
          }
        }
      ];
    }
    
    if (query.toLowerCase().includes('revenue') || query.toLowerCase().includes('profit')) {
      return [
        {
          id: '1',
          title: 'QuickBooks Online - Income Statement',
          type: 'quickbooks',
          description: 'Revenue and profit data extracted from your QuickBooks income statements.',
          metadata: {
            dateRange: 'This Year vs Last Year',
            recordCount: 2156
          }
        },
        {
          id: '2',
          title: 'Profit Margin Calculations',
          type: 'calculation',
          description: 'Computed gross and net profit margins with trend analysis.',
          metadata: {
            accuracy: 100
          }
        }
      ];
    }
    
    if (query.toLowerCase().includes('cash flow')) {
      return [
        {
          id: '1',
          title: 'QuickBooks Online - Cash Flow Statement',
          type: 'quickbooks',
          description: 'Cash flow data including operating, investing, and financing activities.',
          metadata: {
            dateRange: 'Last 12 months',
            recordCount: 3452
          }
        },
        {
          id: '2',
          title: 'Cash Flow Forecast Model',
          type: 'calculation', 
          description: 'Projected cash flow based on historical patterns and current trends.',
          metadata: {
            accuracy: 87.3
          }
        }
      ];
    }
    
    // Default sources
    return [
      {
        id: '1',
        title: 'QuickBooks Online - Financial Data',
        type: 'quickbooks',
        description: 'General financial information retrieved from your QuickBooks Online account.',
        metadata: {
          dateRange: 'Current Period',
          recordCount: 856,
          accuracy: 99.5
        }
      },
      {
        id: '2',
        title: 'Financial Analysis Report',
        type: 'report',
        description: 'Generated analytical insights based on your financial data.',
        timestamp: baseTime
      }
    ];
  };

  return generateSources(query);
};

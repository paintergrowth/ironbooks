// src/components/ai-elements/reasoning.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReasoningStep {
  id: string;
  title: string;
  content: string;
  timestamp?: Date;
  type?: 'analysis' | 'calculation' | 'lookup' | 'synthesis';
}

interface ReasoningProps {
  steps: ReasoningStep[];
  isVisible?: boolean;
  className?: string;
}

const ReasoningStepIcon = ({ type }: { type?: ReasoningStep['type'] }) => {
  switch (type) {
    case 'analysis':
      return <Brain className="w-3 h-3" />;
    case 'calculation':
      return <div className="w-3 h-3 rounded bg-blue-500 flex items-center justify-center text-[8px] text-white font-bold">∑</div>;
    case 'lookup':
      return <div className="w-3 h-3 rounded bg-green-500 flex items-center justify-center text-[8px] text-white font-bold">?</div>;
    case 'synthesis':
      return <div className="w-3 h-3 rounded bg-purple-500 flex items-center justify-center text-[8px] text-white font-bold">⚡</div>;
    default:
      return <Brain className="w-3 h-3" />;
  }
};

export const Reasoning: React.FC<ReasoningProps> = ({ 
  steps, 
  isVisible = true, 
  className 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isVisible || steps.length === 0) return null;

  return (
    <div className={cn("border rounded-lg bg-muted/30 overflow-hidden", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Reasoning ({steps.length} steps)
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      
      {isExpanded && (
        <div className="border-t bg-background/50">
          <div className="p-3 space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted border">
                    <ReasoningStepIcon type={step.type} />
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-px h-4 bg-border mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium">{step.title}</h4>
                    {step.timestamp && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {step.timestamp.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Hook to generate dummy reasoning steps
export const useDummyReasoning = (query: string): ReasoningStep[] => {
  const generateSteps = (query: string): ReasoningStep[] => {
    const baseTime = new Date();
    
    if (query.toLowerCase().includes('expense')) {
      return [
        {
          id: '1',
          title: 'Analyzing expense query',
          content: 'Identifying expense-related keywords and determining the scope of analysis needed.',
          type: 'analysis',
          timestamp: new Date(baseTime.getTime() - 3000)
        },
        {
          id: '2', 
          title: 'Querying transaction data',
          content: 'Searching QuickBooks transactions for expense categories and amounts in the specified timeframe.',
          type: 'lookup',
          timestamp: new Date(baseTime.getTime() - 2000)
        },
        {
          id: '3',
          title: 'Calculating totals',
          content: 'Aggregating expense amounts by category and computing percentage changes from previous periods.',
          type: 'calculation',
          timestamp: new Date(baseTime.getTime() - 1000)
        },
        {
          id: '4',
          title: 'Generating insights',
          content: 'Identifying trends, outliers, and actionable recommendations based on expense patterns.',
          type: 'synthesis',
          timestamp: baseTime
        }
      ];
    }
    
    if (query.toLowerCase().includes('revenue') || query.toLowerCase().includes('profit')) {
      return [
        {
          id: '1',
          title: 'Understanding revenue request',
          content: 'Parsing query to determine if user wants revenue trends, profit margins, or comparative analysis.',
          type: 'analysis',
          timestamp: new Date(baseTime.getTime() - 2500)
        },
        {
          id: '2',
          title: 'Fetching financial data',
          content: 'Retrieving income statements and revenue data from QuickBooks for the requested period.',
          type: 'lookup', 
          timestamp: new Date(baseTime.getTime() - 1500)
        },
        {
          id: '3',
          title: 'Synthesizing response',
          content: 'Combining revenue data with industry benchmarks to provide contextual business insights.',
          type: 'synthesis',
          timestamp: baseTime
        }
      ];
    }
    
    // Default reasoning steps
    return [
      {
        id: '1',
        title: 'Processing query',
        content: 'Analyzing the user\'s question to understand the financial information being requested.',
        type: 'analysis',
        timestamp: new Date(baseTime.getTime() - 2000)
      },
      {
        id: '2',
        title: 'Accessing data',
        content: 'Connecting to QuickBooks Online to retrieve relevant financial records and metrics.',
        type: 'lookup',
        timestamp: new Date(baseTime.getTime() - 1000)
      },
      {
        id: '3',
        title: 'Generating response',
        content: 'Formulating a comprehensive answer with actionable insights and recommendations.',
        type: 'synthesis',
        timestamp: baseTime
      }
    ];
  };

  return generateSteps(query);
};

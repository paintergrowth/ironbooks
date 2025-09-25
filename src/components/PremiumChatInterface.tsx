// src/components/PremiumChatInterface.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, TrendingUp, DollarSign, BarChart3, GlobeIcon, MicIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Message,
  MessageContent,
  MessageAvatar
} from '@/components/ai-elements/message';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  type PromptInputMessage
} from '@/components/ai-elements/prompt-input';
import {
  Suggestions,
  Suggestion
} from '@/components/ai-elements/suggestion';
import {
  Reasoning,
  useDummyReasoning
} from '@/components/ai-elements/reasoning';
import {
  Sources,
  useDummySources
} from '@/components/ai-elements/sources';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  userQuery?: string;
  isStreaming?: boolean;
  reasoningSteps?: Array<{id: string; title: string; content: string; type?: string}>;
  sources?: Array<{id: string; title: string; type: string; description?: string}>;
}
interface PremiumChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isTyping: boolean;
  currentReasoning?: Array<{id: string; title: string; content: string; type?: string}>;
  placeholder?: string;
  suggestedQuestions?: string[];
}
const PremiumChatInterface = ({
  messages,
  onSendMessage,
  isTyping,
  currentReasoning,
  placeholder = "Ask me about cash flow, profits, expenses, or KPIs...",
  suggestedQuestions = [
    "Show me my top expenses this month",
    "How's my profit margin trending?",
    "What's my cash flow forecast?",
    "Analyze my revenue growth"
  ]
}: PremiumChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [model, setModel] = useState<string>('gpt-4o');
  const [useMicrophone, setUseMicrophone] = useState<boolean>(false);
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  // Dummy model data
  const models = [
    { id: 'gpt-4o', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'claude-2', name: 'Claude 2' },
    { id: 'claude-instant', name: 'Claude Instant' },
    { id: 'palm-2', name: 'PaLM 2' },
  ];
  // Dynamic suggestions that change based on conversation context
  const getDynamicSuggestions = () => {
    if (messages.length === 0 || isTyping) return [];
   
    const lastMessage = messages[messages.length - 1];
    const lastUserMessage = messages.filter(m => m.sender === 'user').slice(-1)[0];
   
    // Context-aware suggestions based on the last interaction
    if (lastUserMessage?.text.toLowerCase().includes('expense')) {
      return [
        "Compare to last month",
        "Show top 5 categories",
        "Which expenses can we reduce?",
        "Export expense report"
      ];
    } else if (lastUserMessage?.text.toLowerCase().includes('revenue') || lastUserMessage?.text.toLowerCase().includes('profit')) {
      return [
        "Show growth trends",
        "Compare to budget",
        "Forecast next quarter",
        "Revenue breakdown by source"
      ];
    } else if (lastUserMessage?.text.toLowerCase().includes('cash flow')) {
      return [
        "Show cash flow forecast",
        "Identify payment delays",
        "Working capital analysis",
        "Monthly cash trends"
      ];
    }
   
    // Default follow-up suggestions
    return [
      "Compare to last month",
      "Show me a breakdown",
      "What's driving these numbers?",
      "Create a summary report",
      "Show trends over time"
    ];
  };
  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) {
      return;
    }
    onSendMessage(message.text || 'Sent with attachments');
    setInputValue('');
  };
  return (
    <div className="h-full flex flex-col">
      {/* Chat Messages Container */}
      <div className="flex-1 min-h-0 bg-background rounded-lg shadow-lg border">
        <Conversation className="h-full">
          <ConversationContent className="space-y-4 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-8 py-12">
              <ConversationEmptyState
                title="Welcome to your CFO Agent"
                description="Ask me anything about your finances, reports, or business insights"
                icon={<Bot className="w-12 h-12" />}
              />
             
              {/* Suggested Questions */}
              <div className="w-full max-w-2xl space-y-4">
                <div className="flex items-center justify-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-medium text-foreground">Try asking:</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suggestedQuestions.map((question, index) => {
                    const icons = [TrendingUp, DollarSign, BarChart3, TrendingUp];
                    const Icon = icons[index] || TrendingUp;
                    return (
                      <Button
                        key={index}
                        variant="outline"
                        className="justify-start text-left h-auto p-4 hover:bg-primary/5 hover:border-primary/20 transition-all duration-200"
                        onClick={() => onSendMessage(question)}
                      >
                        <Icon className="w-4 h-4 mr-3 text-primary" />
                        <span className="text-sm">{question}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isLast = index === messages.length - 1;
                const showReasoning = msg.sender === 'agent' && msg.reasoningSteps && msg.reasoningSteps.length > 0;
                const showSources = msg.sender === 'agent' && msg.sources && msg.sources.length > 0;
               
                return (
                  <div key={msg.id} className="space-y-3">
                    {/* Show reasoning outside message bubble for agent responses */}
                    {showReasoning && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%]">
                          <Reasoning
                            steps={msg.reasoningSteps.map(step => ({
                              ...step,
                              timestamp: new Date(),
                              type: step.type as any
                            }))}
                            isVisible={true}
                            className="text-sm bg-muted/50 border-muted"
                          />
                        </div>
                      </div>
                    )}
                   
                    <Message from={msg.sender === 'user' ? 'user' : 'assistant'}>
                      {msg.sender === 'user' ? (
                        <Avatar className="size-8 ring-1 ring-border">
                          <AvatarFallback className="bg-blue-100 text-blue-600">
                            <User className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Avatar className="size-8 ring-1 ring-border">
                          <AvatarImage
                            src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/object/public/assets/img/faviconV2%20(1).png"
                            alt="IronBooks"
                            className="mt-0 mb-0 object-contain p-1"
                          />
                          <AvatarFallback className="bg-blue-600 text-white">
                            <Bot className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <MessageContent variant="contained">
                        <div className="space-y-3">
                          <div className="whitespace-pre-wrap">
                            {msg.text}
                            {msg.isStreaming && (
                              <span className="inline-flex items-center space-x-2 ml-2">
                                <div className="flex space-x-1">
                                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                </div>
                              </span>
                            )}
                          </div>
                         
                          {/* Show sources inside message for completed responses */}
                          {showSources && !msg.isStreaming && (
                            <Sources
                              sources={msg.sources}
                              className="text-sm"
                            />
                          )}
                         
                          <div className="text-xs opacity-70 mt-2">
                            {msg.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                      </MessageContent>
                    </Message>
                  </div>
                );
              })}
             
              {/* Show current reasoning while thinking */}
              {(isTyping || currentReasoning) && currentReasoning && currentReasoning.length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[85%]">
                    <Reasoning
                      steps={currentReasoning.map(step => ({
                        ...step,
                        timestamp: new Date(),
                        type: step.type as any
                      }))}
                      isVisible={true}
                      className="text-sm bg-muted/50 border-muted animate-pulse"
                    />
                  </div>
                </div>
              )}
             
              {isTyping && !currentReasoning && (
                <Message from="assistant">
                  <Avatar className="size-8 ring-1 ring-border">
                    <AvatarImage
                      src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/object/public/assets/img/LOGO-2.png"
                      alt="IronBooks"
                      className="mt-0 mb-0 object-contain p-1"
                    />
                    <AvatarFallback className="bg-blue-600 text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <MessageContent variant="contained">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                      <span className="text-sm opacity-70">CFO Agent is thinking...</span>
                    </div>
                  </MessageContent>
                </Message>
              )}
            </>
          )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
      {/* Input Area */}
      <div className="border-t bg-muted/30 rounded-b-lg shadow-lg border border-t-0">
        <div className="p-4 space-y-4">
          {/* Dynamic Suggestions */}
          {getDynamicSuggestions().length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1">
                Quick actions:
              </p>
              <Suggestions>
                {getDynamicSuggestions().map((suggestion, index) => (
                  <Suggestion
                    key={index}
                    suggestion={suggestion}
                    onClick={onSendMessage}
                    className="whitespace-nowrap"
                  />
                ))}
              </Suggestions>
            </div>
          )}
         
          <PromptInput onSubmit={handleSubmit} globalDrop multiple>
            <PromptInputBody>
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
              <PromptInputTextarea
                placeholder="What would you like to know?"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
            </PromptInputBody>
            <PromptInputToolbar>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <PromptInputButton
                  onClick={() => setUseMicrophone(!useMicrophone)}
                  variant={useMicrophone ? 'default' : 'ghost'}
                >
                  <MicIcon size={16} />
                  <span className="sr-only">Microphone</span>
                </PromptInputButton>
                <PromptInputButton
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  variant={useWebSearch ? 'default' : 'ghost'}
                >
                  <GlobeIcon size={16} />
                  <span>Search</span>
                </PromptInputButton>
                <PromptInputModelSelect
                  onValueChange={(value) => setModel(value)}
                  value={model}
                >
                  <PromptInputModelSelectTrigger>
                    <PromptInputModelSelectValue />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {models.map((model) => (
                      <PromptInputModelSelectItem key={model.id} value={model.id}>
                        {model.name}
                      </PromptInputModelSelectItem>
                    ))}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={!inputValue.trim()}
                status={isTyping ? 'streaming' : 'ready'}
              />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  );
};
export default PremiumChatInterface;

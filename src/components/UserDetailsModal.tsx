import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  User, 
  Activity, 
  MessageSquare, 
  Calendar,
  Link,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface UserDetailsModalProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ user, isOpen, onClose }) => {
  if (!user) return null;

  // Mock CFO agent queries
  const agentQueries = [
    {
      id: '1',
      query: 'What are my top expenses this month?',
      response: 'Your top expenses are: Office supplies ($2,500), Marketing ($1,800), Travel ($1,200)',
      timestamp: '2024-01-15T10:30:00Z',
      tokensUsed: 150
    },
    {
      id: '2',
      query: 'Show me cash flow projections for next quarter',
      response: 'Based on current trends, projected cash flow for Q2 is $45,000 positive',
      timestamp: '2024-01-14T15:45:00Z',
      tokensUsed: 200
    },
    {
      id: '3',
      query: 'Analyze my profit margins by product category',
      response: 'Product A: 35% margin, Product B: 28% margin, Product C: 42% margin',
      timestamp: '2024-01-13T09:15:00Z',
      tokensUsed: 175
    }
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <User className="mr-2 h-5 w-5" />
            User Details: {user.fullName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="queries">CFO Queries</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Email</p>
                    <p className="text-sm">{user.email}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Full Name</p>
                    <p className="text-sm">{user.fullName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Status</p>
                    <Badge variant={user.isActive ? "default" : "secondary"}>
                      {user.isActive ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 mr-1" />
                          Inactive
                        </>
                      )}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Member Since</p>
                    <p className="text-sm">{formatDate(user.createdAt)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Integration Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">QuickBooks Online</p>
                    <Badge variant={user.qboConnected ? "default" : "outline"}>
                      <Link className="w-3 h-3 mr-1" />
                      {user.qboConnected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Last Login</p>
                    <p className="text-sm">{formatDate(user.lastLogin)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">CFO Agent Uses</p>
                    <p className="text-sm font-bold text-blue-600">{user.cfoAgentUses}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Last Login</p>
                      <p className="text-xs text-gray-600">{formatDate(user.lastLogin)}</p>
                    </div>
                    <Calendar className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Account Created</p>
                      <p className="text-xs text-gray-600">{formatDate(user.createdAt)}</p>
                    </div>
                    <User className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Total CFO Agent Queries</p>
                      <p className="text-xs text-gray-600">{user.cfoAgentUses} queries</p>
                    </div>
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="queries" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  CFO Agent Query History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agentQueries.map((query) => (
                    <div key={query.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm font-medium text-gray-900">{query.query}</p>
                        <Badge variant="outline" className="text-xs">
                          {query.tokensUsed} tokens
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{query.response}</p>
                      <p className="text-xs text-gray-400">{formatDate(query.timestamp)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserDetailsModal;
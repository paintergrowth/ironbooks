import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/contexts/AppContext';
import { qboClient, QboStatus } from '@/lib/qboClient';
import { Loader2, RefreshCw, Unlink, ExternalLink } from 'lucide-react';

interface SettingsQuickBooksCardProps {
  orgId: string;
  /** Optional override. If omitted, we derive from context/profile. */
  isDemo?: boolean;
}

export function SettingsQuickBooksCard({ orgId, isDemo }: SettingsQuickBooksCardProps) {
  const [status, setStatus] = useState<QboStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  // Pull a demo flag from context if prop isn't provided
  const { isDemo: contextIsDemo } = useAppContext();
  const effectiveIsDemo = useMemo(() => {
    if (typeof isDemo === 'boolean') return isDemo;
    // Use the isDemo flag from context
    return contextIsDemo;
  }, [isDemo, contextIsDemo]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await qboClient.getStatus(orgId);
      setStatus(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load QuickBooks status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Always attempt to load status (even for demo) so we can show current state.
    loadStatus();

    // Check for OAuth success callback (?connected=qbo)
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'qbo') {
      toast({
        title: 'Success',
        description: 'QuickBooks connected successfully!',
      });
      // Clean up URL (don’t hardcode /settings)
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean || '/settings');
      loadStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]); // re-run if orgId changes

  const handleConnect = async () => {
    // Don’t block; just warn if it’s a demo tenant
    if (effectiveIsDemo) {
      toast({
        title: 'Demo Mode',
        description: 'You are in demo mode. Connecting to QuickBooks is allowed for testing.',
      });
    }

    try {
      setActionLoading('connect');
      const { authUrl } = await qboClient.startOAuth(orgId);
      window.location.href = authUrl;
    } catch (error: any) {
      const message = error?.message || 'Failed to start QuickBooks connection';
      toast({
        title: 'Connection Error',
        description: message.includes("We couldn't connect to QuickBooks")
          ? message
          : "We couldn't connect to QuickBooks. Please try again or contact support.",
        variant: 'destructive',
      });
      setActionLoading(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      setActionLoading('disconnect');
      await qboClient.disconnect(orgId);
      setStatus({ connected: false });
      toast({
        title: 'Success',
        description: 'QuickBooks disconnected successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect QuickBooks',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async () => {
    try {
      setActionLoading('sync');
      await qboClient.sync(orgId);
      toast({
        title: 'Success',
        description: 'Sync started successfully',
      });
      loadStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start sync',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = () => {
    if (!status?.connected) {
      return effectiveIsDemo ? (
        <Badge variant="outline" className="text-gray-600">Demo</Badge>
      ) : null;
    }
    if (status.attention) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Reconnect Soon</Badge>;
    }
    return <Badge variant="default" className="bg-green-100 text-green-800">Connected</Badge>;
  };

  const formatLastSync = (lastSyncAt?: string) => {
    if (!lastSyncAt) return 'Never';
    const date = new Date(lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading QuickBooks Status...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              QuickBooks Online
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>
              QuickBooks Online is used to sync your financials for dashboards and reports.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <div>Company ID: {status.realmId}</div>
              <div>Last sync: {formatLastSync(status.lastSyncAt)}</div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleConnect}
                disabled={!!actionLoading}
                className="flex items-center gap-2"
              >
                {actionLoading === 'connect' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Reconnect
              </Button>
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={!!actionLoading}
                className="flex items-center gap-2"
              >
                {actionLoading === 'sync' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Resync Now
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={!!actionLoading}
                className="flex items-center gap-2"
              >
                {actionLoading === 'disconnect' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            {effectiveIsDemo && (
              <div className="space-y-4 mb-4">
                <div className="text-muted-foreground">
                  Demo mode enabled — connection is permitted for testing.
                </div>
                <Badge variant="outline" className="text-gray-600">
                  Demo
                </Badge>
              </div>
            )}
            <div className="text-muted-foreground mb-4">
              Connect your QuickBooks Online account to automatically sync financial data.
            </div>
            <Button
              onClick={handleConnect}
              disabled={!!actionLoading}
              className="flex items-center gap-2"
            >
              {actionLoading === 'connect' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {status?.connected ? 'Reconnect' : 'Connect to QuickBooks'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

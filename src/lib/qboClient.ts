import { supabase } from './supabase';

export interface QboStatus {
  connected: boolean;
  realmId?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
  attention?: boolean;
}

export interface QboSyncResponse {
  status: string;
  message: string;
}

class QboClient {
  async getStatus(orgId: string): Promise<QboStatus> {
    const { data, error } = await supabase.functions.invoke('qbo-status', {
      body: { orgId },
    });
    
    if (error) throw error;
    return data;
  }

  async startOAuth(orgId: string): Promise<{ authUrl: string }> {
    const { data, error } = await supabase.functions.invoke('qbo-oauth-start', {
      body: { orgId },
    });
    
    if (error) {
      console.error('QBO OAuth Start Error:', error);
      throw new Error(error.message || 'Failed to start QuickBooks connection');
    }
    
    if (data?.error) {
      // Handle structured errors from the edge function
      if (data.detail && (
        data.detail.includes('redirect_uri_mismatch') ||
        data.detail.includes('invalid_client') ||
        data.detail.includes('invalid_grant')
      )) {
        console.error('QBO OAuth Config Error:', data.detail);
      }
      throw new Error(data.error === 'qbo_oauth_start_failed' 
        ? "We couldn't connect to QuickBooks. Please try again or contact support."
        : data.error);
    }
    
    return data;
  }

  async disconnect(orgId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('qbo-disconnect', {
      body: { orgId },
    });
    
    if (error) {
      console.error('QBO Disconnect Error:', error);
      throw error;
    }
    
    if (data?.error) {
      throw new Error(data.error);
    }
  }

  async sync(orgId: string): Promise<QboSyncResponse> {
    const { data, error } = await supabase.functions.invoke('qbo-sync', {
      body: { orgId },
    });
    
    if (error) {
      console.error('QBO Sync Error:', error);
      throw error;
    }
    
    if (data?.error) {
      throw new Error(data.error);
    }
    
    return data;
  }

  async refreshTokens(orgId: string): Promise<{ refreshed: boolean }> {
    const { data, error } = await supabase.functions.invoke('qbo-refresh', {
      body: { orgId },
    });
    
    if (error) {
      console.error('QBO Refresh Error:', error);
      throw error;
    }
    
    if (data?.error) {
      if (data.detail && (
        data.detail.includes('invalid_grant') ||
        data.detail.includes('redirect_uri_mismatch')
      )) {
        console.error('QBO Refresh Config Error:', data.detail);
      }
      throw new Error(data.error === 'refresh_failed' 
        ? "We couldn't refresh your QuickBooks connection. Please reconnect."
        : data.error);
    }
    
    return data;
  }
}

export const qboClient = new QboClient();
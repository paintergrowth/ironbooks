import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';

export interface QBOStatus {
  connected: boolean;
  company_name?: string;
  realm_id?: string;
  last_sync?: string;
  loading: boolean;
  error?: string;
}

export const useQBOStatus = () => {
  const { user } = useAppContext();
  const [status, setStatus] = useState<QBOStatus>({
    connected: false,
    loading: true
  });

  const checkQBOStatus = async () => {
    if (!user?.id) {
      setStatus({ connected: false, loading: false });
      return;
    }

    setStatus(prev => ({ ...prev, loading: true }));

    try {
      // First try to get from profiles table directly (faster)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('qbo_realm_id, qbo_connected, qbo_connected_at')
        .eq('id', user.id)
        .single();

      if (!profileError && profile) {
        setStatus({
          connected: Boolean(profile.qbo_connected),
          realm_id: profile.qbo_realm_id,
          loading: false,
          error: undefined
        });

        // If we have realm_id, try to get company name from qbo-company
        if (profile.qbo_realm_id && profile.qbo_connected) {
          try {
            const { data: companyData } = await supabase.functions.invoke('qbo-company', {
              body: { realmId: profile.qbo_realm_id, userId: user.id }
            });
            if (companyData?.companyName) {
              setStatus(prev => ({
                ...prev,
                company_name: companyData.companyName
              }));
            }
          } catch (err) {
            // Non-critical error, just log it
            console.warn('Could not fetch company name:', err);
          }
        }
        return;
      }

      // Fallback to qbo-status function if available
      const { data, error } = await supabase.functions.invoke('qbo-status', {
        body: { userId: user.id }
      });

      if (error) {
        console.error('QBO status check error:', error);
        setStatus({
          connected: false,
          loading: false,
          error: 'Failed to check QuickBooks status'
        });
        return;
      }

      setStatus({
        connected: data?.connected || false,
        company_name: data?.company_name,
        realm_id: data?.realm_id,
        last_sync: data?.last_sync,
        loading: false,
        error: undefined
      });
    } catch (err) {
      console.error('QBO status error:', err);
      setStatus({
        connected: false,
        loading: false,
        error: 'Failed to check QuickBooks connection'
      });
    }
  };

  useEffect(() => {
    if (user) {
      checkQBOStatus();
    } else {
      setStatus({ connected: false, loading: false });
    }
  }, [user]);

  return {
    ...status,
    refresh: checkQBOStatus
  };
};

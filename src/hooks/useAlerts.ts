import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Alert, AlertCondition } from '../types';

interface DbAlert {
  id: string;
  ticker: string;
  condition: string;
  status: 'active' | 'triggered' | 'paused';
  reference_level: number | null;
  trigger_message: string | null;
  last_checked_at: string | null;
  triggered_at: string | null;
  created_at: string;
}

function toAlert(row: DbAlert): Alert {
  return {
    id: row.id,
    ticker: row.ticker,
    condition: row.condition as AlertCondition,
    status: row.status === 'paused' ? 'active' : row.status,
    createdAt: new Date(row.created_at).getTime(),
    lastChecked: row.last_checked_at ? new Date(row.last_checked_at).getTime() : undefined,
    triggeredAt: row.triggered_at ? new Date(row.triggered_at).getTime() : undefined,
    triggerMessage: row.trigger_message ?? undefined,
  };
}

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const reload = useCallback(async () => {
    if (!user) { setAlerts([]); return; }
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });
    setAlerts((data as DbAlert[] | null)?.map(toAlert) ?? []);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  // Realtime subscription — pushes alert status changes instantly
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`alerts-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `user_id=eq.${user.id}` },
        () => reload()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alert_events', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { ticker: string; message: string; condition: string };
          if ('Notification' in window && Notification.permission === 'granted') {
            const title = row.condition === 'RESISTANCE_BREAKOUT'
              ? `🚀 BREAKOUT: ${row.ticker}`
              : row.condition === 'SUPPORT_BREAKDOWN'
              ? `⚠️ BREAKDOWN: ${row.ticker}`
              : `Weinstein Alert: ${row.ticker}`;
            new Notification(title, { body: row.message });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, reload]);

  const add = useCallback(
    async (ticker: string, condition: AlertCondition, referenceLevel?: number) => {
      if (!user) throw new Error('Sesión no iniciada — inicia sesión para crear alertas.');
      const { error } = await supabase.from('alerts').insert({
        user_id: user.id,
        ticker: ticker.toUpperCase(),
        condition,
        reference_level: referenceLevel ?? null,
      });
      if (error) throw new Error(error.message);
      await reload();
    },
    [user, reload]
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('alerts').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return { alerts, add, remove, reload };
}

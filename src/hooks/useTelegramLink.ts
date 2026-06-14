import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface TelegramStatus {
  connected: boolean;
  chat_id: number | null;
  link_token: string | null;
  bot_username: string;
}

const EMPTY: TelegramStatus = { connected: false, chat_id: null, link_token: null, bot_username: '' };

export function useTelegramLink() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-link', { method: 'GET' });
      setStatus(!error && data ? (data as TelegramStatus) : EMPTY);
    } catch {
      setStatus(EMPTY);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll every 2s while a link_token is pending (waiting for user to /start the bot)
  useEffect(() => {
    if (status?.link_token && !status.connected) {
      pollRef.current = setInterval(async () => {
        try {
          const { data, error } = await supabase.functions.invoke('telegram-link', { method: 'GET' });
          if (error || !data) return;
          const s = data as TelegramStatus;
          // Only update status if the user connected — don't overwrite token with null
          if (s.connected) {
            setStatus(s);
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        } catch { /* ignore */ }
      }, 2000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.link_token, status?.connected]);

  const generateToken = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('telegram-link', { method: 'POST' });
      if (data) setStatus(prev => ({ ...(prev ?? EMPTY), ...data }));
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke('telegram-link', { method: 'DELETE' });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  return { status, loading, generateToken, disconnect };
}

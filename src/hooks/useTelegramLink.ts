import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-link`;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export interface TelegramStatus {
  connected: boolean;
  chat_id: number | null;
  link_token: string | null;
  bot_username: string;
}

export function useTelegramLink() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(FN_BASE, { headers });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 2s while a link_token is pending (waiting for user to /start in Telegram)
  useEffect(() => {
    if (status?.link_token && !status.connected) {
      pollRef.current = setInterval(async () => {
        const headers = await authHeaders();
        const res = await fetch(FN_BASE, { headers });
        if (!res.ok) return;
        const s: TelegramStatus = await res.json();
        setStatus(s);
        if (s.connected) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      }, 2000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.link_token, status?.connected]);

  const generateToken = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(FN_BASE, { method: 'POST', headers });
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      await fetch(FN_BASE, { method: 'DELETE', headers });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  return { status, loading, generateToken, disconnect };
}

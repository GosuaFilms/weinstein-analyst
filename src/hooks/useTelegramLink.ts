import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface TelegramStatus {
  connected: boolean;
  chat_id: number | null;
  link_token: string | null;
  bot_username: string;
}

const EMPTY: TelegramStatus = { connected: false, chat_id: null, link_token: null, bot_username: '' };

async function callLink(action: 'status' | 'generate' | 'disconnect'): Promise<TelegramStatus | null> {
  // Explicitly set the user's JWT on the functions client before each call,
  // because supabase-js may still have the anon key if the session was restored
  // from storage (INITIAL_SESSION doesn't trigger setAuth in some versions).
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  supabase.functions.setAuth(session.access_token);

  const { data, error } = await supabase.functions.invoke('telegram-link', {
    body: { action },
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[telegram-link] invoke error:', error.message, error);
    return null;
  }
  if (!data) {
    // eslint-disable-next-line no-console
    console.error('[telegram-link] no data returned');
    return null;
  }
  return data as TelegramStatus;
}

export function useTelegramLink() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const result = await callLink('status');
    setStatus(result ?? EMPTY);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll every 2s while link_token is pending (waiting for /start in Telegram bot)
  useEffect(() => {
    if (status?.link_token && !status.connected) {
      pollRef.current = setInterval(async () => {
        const result = await callLink('status');
        if (!result) return;
        if (result.connected) {
          setStatus(result);
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
      const result = await callLink('generate');
      if (result) setStatus(result);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callLink('disconnect');
      if (result) setStatus(result);
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, generateToken, disconnect };
}

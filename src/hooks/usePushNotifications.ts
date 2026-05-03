import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SW_URL = '/sw.js';

// VAPID public key injected at build time via Vite env
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushState = 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'loading';

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');

  // Check current subscription status on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[Push] VITE_VAPID_PUBLIC_KEY not set — push disabled');
      setState('unsupported');
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setState('subscribed');
        } else {
          const perm = Notification.permission;
          setState(perm === 'denied' ? 'denied' : 'prompt');
        }
      } catch (err) {
        console.error('[Push] SW registration error', err);
        setState('unsupported');
      }
    })();
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!VAPID_PUBLIC_KEY) return false;
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const { session } = (await supabase.auth.getSession()).data;
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-subscribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            endpoint: json.endpoint,
            p256dh: (json.keys as Record<string, string>).p256dh,
            auth: (json.keys as Record<string, string>).auth,
          }),
        }
      );

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setState('subscribed');
      return true;
    } catch (err) {
      console.error('[Push] subscribe error', err);
      const perm = Notification.permission;
      setState(perm === 'denied' ? 'denied' : 'prompt');
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) { setState('prompt'); return true; }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const { session } = (await supabase.auth.getSession()).data;
      if (session) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-subscribe`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ endpoint }),
          }
        );
      }

      setState('prompt');
      return true;
    } catch (err) {
      console.error('[Push] unsubscribe error', err);
      setState('subscribed'); // revert on error
      return false;
    }
  }, []);

  return { state, subscribe, unsubscribe };
}

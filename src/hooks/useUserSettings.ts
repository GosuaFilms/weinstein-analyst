import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface UserSettings {
  daily_email_enabled: boolean;
}

interface UseUserSettingsReturn {
  settings: UserSettings | null;
  loading: boolean;
  saving: boolean;
  update: (patch: Partial<UserSettings>) => Promise<void>;
}

export function useUserSettings(): UseUserSettingsReturn {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('user_settings')
        .select('daily_email_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!cancelled) {
        setSettings(data ?? { daily_email_enabled: true });
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function update(patch: Partial<UserSettings>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    const next = { ...(settings ?? { daily_email_enabled: true }), ...patch };
    setSettings(next);

    await supabase.from('user_settings').upsert({
      user_id: user.id,
      ...next,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
  }

  return { settings, loading, saving, update };
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface UserSettings {
  daily_email_enabled: boolean;
  weekly_stage_alerts: boolean;
  weekly_report_enabled: boolean;
  onboarding_emails: boolean;
  breakout_alerts: boolean;
}

// Daily brief is opt-in; the weekly review and Saturday report are on until switched off
const DEFAULTS: UserSettings = { daily_email_enabled: false, weekly_stage_alerts: true, weekly_report_enabled: true, onboarding_emails: true, breakout_alerts: true };

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
        .select('daily_email_enabled, weekly_stage_alerts, weekly_report_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!cancelled) {
        setSettings({ ...DEFAULTS, ...(data ?? {}) });
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
    const next = { ...(settings ?? DEFAULTS), ...patch };
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

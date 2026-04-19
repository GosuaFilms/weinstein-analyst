import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { SavedAnalysis, AnalysisResult, OperationAnalysisResult } from '../types';

interface DbAnalysis {
  id: string;
  created_at: string;
  kind: 'scan' | 'operation';
  ticker: string | null;
  label: string;
  result: AnalysisResult | OperationAnalysisResult;
  preview_urls: string[] | null;
}

function toSaved(row: DbAnalysis): SavedAnalysis {
  return {
    id: row.id,
    timestamp: new Date(row.created_at).getTime(),
    label: row.label,
    result: row.result as AnalysisResult,
    previewUrls: row.preview_urls ?? undefined,
  };
}

export function useAnalyses() {
  const { user } = useAuth();
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setHistory([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setHistory((data as DbAnalysis[] | null)?.map(toSaved) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(
    async (kind: 'scan' | 'operation', label: string, result: AnalysisResult | OperationAnalysisResult, previewUrls?: string[]) => {
      if (!user) return;
      const { data, error } = await supabase
        .from('analyses')
        .insert({
          user_id: user.id,
          kind,
          ticker: (result as AnalysisResult).tickerSymbol ?? null,
          label,
          result,
          preview_urls: previewUrls ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      const saved = toSaved(data as DbAnalysis);
      setHistory(prev => [saved, ...prev]);
      return saved;
    },
    [user]
  );

  const remove = useCallback(async (id: string) => {
    await supabase.from('analyses').delete().eq('id', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }, []);

  const clear = useCallback(async () => {
    if (!user) return;
    await supabase.from('analyses').delete().eq('user_id', user.id);
    setHistory([]);
  }, [user]);

  return { history, loading, save, remove, clear, reload };
}

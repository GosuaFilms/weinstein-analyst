// Back-compat shim — components keep importing from this path but the
// actual work now happens server-side in Supabase Edge Functions.

export {
  analyzeMarket,
  analyzeOperation,
  chat as chatWithAssistant,
  getLivePrice,
} from '../lib/api';

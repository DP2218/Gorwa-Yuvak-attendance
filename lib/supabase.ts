import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function normalizeSupabaseUrl(raw: string): string {
  let cleaned = raw.trim().replace(/^["']|["']$/g, '');
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }
  try {
    const parsed = new URL(cleaned);
    return parsed.origin;
  } catch {
    return cleaned.replace(/\/+$/, '');
  }
}

// Server-only. Uses the service role / secret key, so never import this from a client component.
export function db(): SupabaseClient {
  if (client) return client;
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!rawUrl || !rawKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const url = normalizeSupabaseUrl(rawUrl);
  const key = rawKey.trim().replace(/^["']|["']$/g, '');

  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

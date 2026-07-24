import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Cliente Supabase para el navegador (Client Components). */
export function createClient() {
  return createBrowserClient(url, key);
}

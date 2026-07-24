import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Cliente Supabase con la sesión del usuario web (RLS activa). Uso en Server Components,
 *  Server Actions y Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: lo refresca el middleware.
        }
      },
    },
  });
}

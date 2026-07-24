'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/adapters/supabase/client';

/** Refresca la ruta cuando cambian las tablas indicadas (Realtime).
 *  RLS aplica: solo llegan los cambios de las filas del propio usuario. */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const key = tables.join(',');

  useEffect(() => {
    const list = key.split(',');
    const supabase = createClient();
    const channel = supabase.channel('rt-' + key);
    for (const table of list) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => router.refresh(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}

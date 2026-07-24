// Etapa 0 · Chequeo de RLS. Debe devolver 0 filas: toda tabla de `public` con
// RLS activa y con al menos una política. Detecta los dos fallos silenciosos:
// (a) tabla sin RLS, (b) RLS activada sin ninguna política (bloquea todo).
// Uso: node --env-file=.env.local scripts/check-rls.mjs
import { Client } from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL (¿corriste con --env-file=.env.local?)');
  process.exit(2);
}

const query = `
select tablename as name, 'sin RLS' as issue
  from pg_tables
 where schemaname = 'public' and rowsecurity = false
union all
select c.relname, 'RLS sin políticas'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname);
`;

const client = new Client({ connectionString: url });
try {
  await client.connect();
  const { rows } = await client.query(query);
  if (rows.length > 0) {
    console.error('❌ check:rls falló — tablas con problema de RLS:');
    for (const r of rows) console.error(`   - ${r.name}: ${r.issue}`);
    process.exit(1);
  }
  console.log('✅ check:rls: 0 filas. Todas las tablas de public tienen RLS y políticas.');
} finally {
  await client.end();
}

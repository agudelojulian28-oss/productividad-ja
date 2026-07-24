-- Realtime (Etapa 1): que crear/cambiar algo aparezca al instante en la web.
-- RLS sigue aplicando en Realtime: cada usuario solo recibe sus propias filas.

alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table areas;

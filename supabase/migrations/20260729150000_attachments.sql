-- Multimodal · Guardar fotos. Bucket privado + tabla de adjuntos.
-- Al llegar una imagen se sube al bucket y se registra una fila (saved=false);
-- cuando el usuario pide guardarla, el agente la marca saved=true y la enlaza.

-- ── Bucket privado ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Políticas sobre storage.objects: cada quien solo su carpeta {user_id}/...
create policy "attachments_own_select" on storage.objects for select
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "attachments_own_insert" on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "attachments_own_delete" on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── Tabla de adjuntos ──────────────────────────────────────────────────────
create table attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,           -- {user_id}/{uuid}.jpg dentro del bucket
  mime         text not null,
  project_id   uuid references projects(id) on delete set null,
  description  text,
  saved        boolean not null default false,   -- true = el usuario pidió guardarla
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index attachments_saved_by_project on attachments (user_id, project_id)
  where saved and project_id is not null;

alter table attachments enable row level security;
alter table attachments force  row level security;
create policy attachments_owner on attachments for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger audit_attachments after insert or update or delete on attachments
  for each row execute function audit_row();
create trigger touch_attachments before update on attachments
  for each row execute function touch_updated_at();

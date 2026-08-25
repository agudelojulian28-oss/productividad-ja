-- ADR-031: Sostenimiento. Registro de los servicios que cuestan operar la app (o podrían
-- costar a futuro), con un contador del gasto mensual y datos para avisar cuándo recargar
-- (créditos bajos) o cuándo se renueva. Todo en COP (base de la app). Un solo usuario.

create table sustaining_services (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 1 and 80),
  provider              text,
  category              text not null default 'otro'
                          check (category in ('infra', 'ia', 'canal', 'dominio', 'otro')),
  status                text not null default 'paga'
                          check (status in ('paga', 'gratis', 'futuro')),
  cadence               text not null default 'mensual'
                          check (cadence in ('mensual', 'anual', 'uso', 'unico')),
  amount_minor          bigint not null default 0 check (amount_minor >= 0),
  balance_minor         bigint,                       -- créditos restantes (prepago)
  alert_threshold_minor bigint,                       -- avisar cuando balance <= umbral
  renews_on             date,                         -- próxima renovación (suscripción)
  active                boolean not null default true,
  notes                 text check (char_length(notes) <= 2000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table sustaining_services enable row level security;
alter table sustaining_services force  row level security;
create policy sustaining_owner on sustaining_services for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger audit_sustaining after insert or update or delete on sustaining_services
  for each row execute function audit_row();
create trigger touch_sustaining before update on sustaining_services
  for each row execute function touch_updated_at();

-- Huella (ADR-023): credenciales WebAuthn/passkey del usuario. RLS propiedad del
-- usuario; el reto (challenge) NO se guarda aquí (viaja en cookie httpOnly firmada).

create table webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,          -- base64url del credentialID
  public_key    text not null,                 -- base64url de la clave pública COSE
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  device_label  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index webauthn_by_user on webauthn_credentials (user_id);

alter table webauthn_credentials enable row level security;
alter table webauthn_credentials force  row level security;
create policy webauthn_credentials_owner on webauthn_credentials for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger audit_webauthn after insert or update or delete on webauthn_credentials
  for each row execute function audit_row();
create trigger touch_webauthn before update on webauthn_credentials
  for each row execute function touch_updated_at();

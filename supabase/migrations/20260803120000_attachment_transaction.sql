-- Comprobantes: una imagen (adjunto) puede enlazarse a un movimiento (transacción),
-- igual que ya se enlaza a un proyecto. Reusa el bucket, la RLS (attachments_owner
-- cubre todas las columnas) y los triggers de auditoría/touch existentes.
-- No es tabla nueva → no requiere políticas ni check:rls extra.

alter table attachments
  add column if not exists transaction_id uuid references transactions(id) on delete cascade;

create index if not exists attachments_by_transaction
  on attachments (user_id, transaction_id)
  where transaction_id is not null;

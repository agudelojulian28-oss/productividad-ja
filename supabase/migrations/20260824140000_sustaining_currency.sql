-- Sostenimiento: cada servicio puede estar en COP o USD. Los montos (amount/balance/
-- threshold) quedan en la moneda del servicio; la conversión a COP para el contador se
-- hace con la TRM del día (en la app, no en la BD). Ver ADR-031.

alter table sustaining_services
  add column currency char(3) not null default 'COP' check (currency in ('COP', 'USD'));

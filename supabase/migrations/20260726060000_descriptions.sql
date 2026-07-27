-- Descripción guardable en cada nivel del árbol (áreas, proyectos, metas).
-- Las tareas ya tienen `notes`; los eventos guardan su descripción en Google Calendar.
-- Aditivo: columnas de texto opcionales; heredan las políticas RLS `_owner` existentes.

alter table areas    add column if not exists description text;
alter table projects add column if not exists description text;
alter table goals    add column if not exists description text;

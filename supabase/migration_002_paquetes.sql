-- =====================================================================
--  CRÉDITO PRO — Actualización 2: paquetes de cartas, adjuntos, directorio de acreedores
--  (Si instalas desde cero, schema.sql ya lo incluye. Se puede correr más de una vez.)
-- =====================================================================

-- Plantillas: propósito y qué documentos van adjuntos
alter table public.cr_templates add column if not exists purpose     text default 'otro';   -- disputa_cuentas | inquiries | personal | validacion | goodwill | otro
alter table public.cr_templates add column if not exists attach_id   boolean default true;
alter table public.cr_templates add column if not exists attach_bill boolean default true;
alter table public.cr_templates add column if not exists attach_ssn  boolean default false;

update public.cr_templates set purpose = 'disputa_cuentas' where purpose = 'otro' and recipient = 'bureau' and applies_to = 'cuenta';
update public.cr_templates set purpose = 'inquiries'       where purpose = 'otro' and recipient = 'bureau' and applies_to = 'inquiry';
update public.cr_templates set purpose = 'personal'        where purpose = 'otro' and recipient = 'bureau' and applies_to = 'personal';
update public.cr_templates set purpose = 'validacion', attach_bill = false where purpose = 'otro' and recipient = 'acreedor' and name ilike '%valid%';
update public.cr_templates set purpose = 'goodwill', attach_id = false, attach_bill = false where purpose = 'otro' and recipient = 'acreedor' and name ilike '%buena voluntad%';

-- Paquetes de cartas (lo que arma el asistente)
create table if not exists public.cr_packages (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cr_clients(id) on delete cascade,
  options    jsonb default '{}'::jsonb,
  summary    jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cr_letters add column if not exists package_id   uuid references public.cr_packages(id) on delete set null;
alter table public.cr_letters add column if not exists packet_order int;
alter table public.cr_letters add column if not exists attach_id    boolean default false;
alter table public.cr_letters add column if not exists attach_bill  boolean default false;
alter table public.cr_letters add column if not exists attach_ssn   boolean default false;
update public.cr_letters set attach_id = true, attach_bill = true where attach_docs and not attach_id and not attach_bill;

-- Directorio de acreedores / agencias de cobro (se llena solo con los reportes)
create table if not exists public.cr_creditors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  norm       text unique,
  address    text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cr_packages  enable row level security;
alter table public.cr_creditors enable row level security;
drop policy if exists admin_all on public.cr_packages;
create policy admin_all on public.cr_packages for all to authenticated using (public.cr_is_admin()) with check (public.cr_is_admin());
drop policy if exists admin_all on public.cr_creditors;
create policy admin_all on public.cr_creditors for all to authenticated using (public.cr_is_admin()) with check (public.cr_is_admin());

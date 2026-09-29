-- =====================================================================
--  CRÉDITO PRO — Base de datos (Supabase / Postgres)
--  Cómo usar: Supabase → SQL Editor → New query → pega TODO este archivo → Run
--  Se puede correr más de una vez sin dañar datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Administradores (tú y tu equipo)
-- ---------------------------------------------------------------------
create table if not exists public.cr_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function public.cr_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cr_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Configuración de la empresa
-- ---------------------------------------------------------------------
create table if not exists public.cr_settings (
  id                   int primary key default 1 check (id = 1),
  company_name         text default 'Mi Empresa de Crédito',
  company_address      text,
  company_phone        text,
  company_email        text,
  fee_coleccion        numeric(10,2) default 0,
  fee_charge_off       numeric(10,2) default 0,
  fee_pagos_tarde      numeric(10,2) default 0,
  fee_repo             numeric(10,2) default 0,
  fee_registro_publico numeric(10,2) default 0,
  fee_otro_negativo    numeric(10,2) default 0,
  fee_inquiry          numeric(10,2) default 0,
  fee_personal         numeric(10,2) default 0,
  address_tu           text default E'TransUnion LLC\nConsumer Dispute Center\nP.O. Box 2000\nChester, PA 19016',
  address_ex           text default E'Experian\nP.O. Box 4500\nAllen, TX 75013',
  address_eq           text default E'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374',
  allow_public_signup  boolean default true,
  updated_at           timestamptz default now()
);
insert into public.cr_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table if not exists public.cr_clients (
  id                  uuid primary key default gen_random_uuid(),
  client_no           bigint generated always as identity,
  user_id             uuid unique references auth.users(id) on delete set null,
  username            text unique,
  status              text not null default 'nuevo',   -- nuevo | activo | en_pausa | completado | cancelado
  source              text not null default 'admin',   -- admin | portal
  first_name          text,
  middle_name         text,
  last_name           text,
  suffix              text,
  dob                 date,
  ssn                 text,
  email               text,
  phone               text,
  phone2              text,
  address             text,
  address2            text,
  city                text,
  state               text,
  zip                 text,
  prev_address        text,
  employer            text,
  start_date          date default current_date,
  monthly_fee         numeric(10,2),
  notes               text,
  intake_completed    boolean not null default false,
  intake_completed_at timestamptz,
  reviewed            boolean not null default true,  -- false = registro nuevo del portal sin revisar
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.cr_my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.cr_clients where user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------
-- Documentos (licencia, bill, SSN, otros) — archivos en Storage bucket cr-files
-- ---------------------------------------------------------------------
create table if not exists public.cr_documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.cr_clients(id) on delete cascade,
  doc_type    text not null default 'otro',  -- licencia_frente | licencia_atras | bill | ssn | otro
  file_path   text not null,
  file_name   text,
  mime        text,
  uploaded_by text default 'admin',          -- admin | cliente
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Reportes de crédito subidos
-- ---------------------------------------------------------------------
create table if not exists public.cr_reports (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.cr_clients(id) on delete cascade,
  provider    text,
  report_date date,
  bureaus     text[] default '{TU,EX,EQ}',
  file_path   text,
  file_name   text,
  score_tu    int,
  score_ex    int,
  score_eq    int,
  summary     jsonb default '{}'::jsonb,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Items del reporte: cuentas, inquiries e info personal — UNO POR BUREAU
-- (una colección en 3 bureaus = 3 filas)
-- ---------------------------------------------------------------------
create table if not exists public.cr_items (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.cr_clients(id) on delete cascade,
  kind              text not null,          -- cuenta | inquiry | personal
  category          text,                   -- cuenta: coleccion|charge_off|pagos_tarde|repo|registro_publico|otro_negativo|positiva
                                            -- personal: nombre|alias|direccion|telefono|empleador|fecha_nacimiento
  bureau            text not null check (bureau in ('TU','EX','EQ')),
  name              text,                   -- acreedor / valor
  account_number    text,
  original_creditor text,
  account_type      text,
  balance           numeric(12,2),
  past_due          numeric(12,2),
  high_credit       numeric(12,2),
  credit_limit      numeric(12,2),
  monthly_payment   numeric(12,2),
  date_opened       text,
  last_reported     text,
  item_date         text,
  account_status    text,
  payment_status    text,
  comments          text,
  late_30           int default 0,
  late_60           int default 0,
  late_90           int default 0,
  is_negative       boolean not null default false,
  match_key         text,
  status            text not null default 'activa',   -- activa | en_disputa | eliminada | verificada
  dispute_round     int not null default 0,
  last_dispute_at   date,
  first_report_id   uuid references public.cr_reports(id) on delete set null,
  last_report_id    uuid references public.cr_reports(id) on delete set null,
  removed_report_id uuid references public.cr_reports(id) on delete set null,
  removed_at        date,
  reappeared        boolean not null default false,
  fee               numeric(10,2),
  notes             text,
  extra             jsonb default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists cr_items_client_idx on public.cr_items(client_id, kind, bureau);

-- ---------------------------------------------------------------------
-- Cobros (se crean solos cuando se elimina un item)
-- ---------------------------------------------------------------------
create table if not exists public.cr_charges (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.cr_clients(id) on delete cascade,
  item_id     uuid references public.cr_items(id) on delete set null,
  description text not null,
  amount      numeric(10,2) not null default 0,
  status      text not null default 'pendiente',  -- pendiente | pagado | anulado
  paid_at     date,
  method      text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Plantillas de cartas
-- ---------------------------------------------------------------------
create table if not exists public.cr_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  recipient   text not null default 'bureau',  -- bureau | acreedor
  applies_to  text not null default 'cuenta',  -- cuenta | inquiry | personal | todos
  round       int default 1,
  default_reason text,
  body        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cartas generadas
-- ---------------------------------------------------------------------
create table if not exists public.cr_letters (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.cr_clients(id) on delete cascade,
  template_id       uuid references public.cr_templates(id) on delete set null,
  template_name     text,
  recipient_type    text default 'bureau',
  bureau            text,
  recipient_name    text,
  recipient_address text,
  round             int,
  item_ids          uuid[] default '{}',
  body_html         text,
  attach_docs       boolean default false,
  status            text not null default 'generada',  -- generada | enviada | respondida
  sent_at           date,
  tracking_number   text,
  response_notes    text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Historial de actividad
-- ---------------------------------------------------------------------
create table if not exists public.cr_activity (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.cr_clients(id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.cr_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists cr_clients_touch on public.cr_clients;
create trigger cr_clients_touch before update on public.cr_clients for each row execute function public.cr_touch();
drop trigger if exists cr_items_touch on public.cr_items;
create trigger cr_items_touch before update on public.cr_items for each row execute function public.cr_touch();
drop trigger if exists cr_templates_touch on public.cr_templates;
create trigger cr_templates_touch before update on public.cr_templates for each row execute function public.cr_touch();

-- El cliente solo puede cambiar su información personal, no el estado ni notas internas
create or replace function public.cr_protect_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.cr_is_admin() or auth.uid() is null then return new; end if;
  new.id := old.id; new.client_no := old.client_no; new.user_id := old.user_id; new.username := old.username;
  new.status := old.status; new.source := old.source; new.start_date := old.start_date;
  new.monthly_fee := old.monthly_fee; new.notes := old.notes; new.reviewed := old.reviewed;
  new.created_at := old.created_at;
  if new.intake_completed and not old.intake_completed then
    new.intake_completed_at := now();
    insert into public.cr_activity(client_id, message) values (new.id, 'El cliente completó su información en el portal');
  end if;
  return new;
end $$;
drop trigger if exists cr_clients_protect on public.cr_clients;
create trigger cr_clients_protect before update on public.cr_clients for each row execute function public.cr_protect_client();

-- ---------------------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------------------
alter table public.cr_admins    enable row level security;
alter table public.cr_settings  enable row level security;
alter table public.cr_clients   enable row level security;
alter table public.cr_documents enable row level security;
alter table public.cr_reports   enable row level security;
alter table public.cr_items     enable row level security;
alter table public.cr_charges   enable row level security;
alter table public.cr_templates enable row level security;
alter table public.cr_letters   enable row level security;
alter table public.cr_activity  enable row level security;

-- Admin: acceso total
do $$
declare t text;
begin
  foreach t in array array['cr_admins','cr_settings','cr_clients','cr_documents','cr_reports','cr_items','cr_charges','cr_templates','cr_letters','cr_activity']
  loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.cr_is_admin()) with check (public.cr_is_admin())', t);
  end loop;
end $$;

-- Configuración: cualquiera puede leer (nombre de empresa y si el registro está abierto)
drop policy if exists settings_read on public.cr_settings;
create policy settings_read on public.cr_settings for select to anon, authenticated using (true);

-- Cliente: ve y edita solo su propio registro
drop policy if exists client_self_select on public.cr_clients;
create policy client_self_select on public.cr_clients for select to authenticated using (user_id = auth.uid());
drop policy if exists client_self_update on public.cr_clients;
create policy client_self_update on public.cr_clients for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cliente: sus documentos
drop policy if exists client_docs_select on public.cr_documents;
create policy client_docs_select on public.cr_documents for select to authenticated using (client_id = public.cr_my_client_id());
drop policy if exists client_docs_insert on public.cr_documents;
create policy client_docs_insert on public.cr_documents for insert to authenticated with check (client_id = public.cr_my_client_id() and uploaded_by = 'cliente');
drop policy if exists client_docs_delete on public.cr_documents;
create policy client_docs_delete on public.cr_documents for delete to authenticated using (client_id = public.cr_my_client_id() and uploaded_by = 'cliente');

-- Cliente: ver su progreso (items y cartas)
drop policy if exists client_items_select on public.cr_items;
create policy client_items_select on public.cr_items for select to authenticated using (client_id = public.cr_my_client_id());
drop policy if exists client_letters_select on public.cr_letters;
create policy client_letters_select on public.cr_letters for select to authenticated using (client_id = public.cr_my_client_id());

-- ---------------------------------------------------------------------
-- Storage: bucket privado para documentos y reportes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cr-files', 'cr-files', false)
on conflict (id) do nothing;

drop policy if exists cr_files_admin on storage.objects;
create policy cr_files_admin on storage.objects for all to authenticated
  using (bucket_id = 'cr-files' and public.cr_is_admin())
  with check (bucket_id = 'cr-files' and public.cr_is_admin());

drop policy if exists cr_files_client_select on storage.objects;
create policy cr_files_client_select on storage.objects for select to authenticated
  using (bucket_id = 'cr-files' and (storage.foldername(name))[1] = public.cr_my_client_id()::text and (storage.foldername(name))[2] = 'docs');
drop policy if exists cr_files_client_insert on storage.objects;
create policy cr_files_client_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cr-files' and (storage.foldername(name))[1] = public.cr_my_client_id()::text and (storage.foldername(name))[2] = 'docs');
drop policy if exists cr_files_client_delete on storage.objects;
create policy cr_files_client_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cr-files' and (storage.foldername(name))[1] = public.cr_my_client_id()::text and (storage.foldername(name))[2] = 'docs');

-- ---------------------------------------------------------------------
-- Plantillas de cartas por defecto (solo si no hay ninguna)
-- ---------------------------------------------------------------------
do $$
declare hdr text := E'{{cliente_nombre}}\n{{cliente_direccion}}\n{{cliente_ciudad_estado_zip}}\nDate of Birth: {{cliente_dob}}\nSSN: XXX-XX-{{cliente_ssn4}}\n\n{{fecha}}\n\n{{destinatario_nombre}}\n{{destinatario_direccion}}\n\n';
declare ftr text := E'\n\nSincerely,\n\n\n\n_____________________________\n{{cliente_nombre}}\n\nEnclosures: Copy of government-issued ID and proof of address';
begin
if not exists (select 1 from public.cr_templates) then
insert into public.cr_templates (name, recipient, applies_to, round, default_reason, body) values
('Ronda 1 – Disputa de cuentas', 'bureau', 'cuenta', 1, 'This information is inaccurate and cannot be verified.',
 hdr || E'RE: Request for Investigation of Inaccurate Information\n\nTo Whom It May Concern:\n\nI am writing to dispute the following information in my credit file. After reviewing my credit report, I found that the items listed below are inaccurate, incomplete, or unverifiable.\n\n{{lista_items}}\n\nUnder the Fair Credit Reporting Act, 15 U.S.C. § 1681i, you are required to conduct a reasonable reinvestigation of the disputed information and to delete any information that is inaccurate or cannot be verified. Please investigate these items and delete or correct them, and send me an updated copy of my credit report when your investigation is complete.' || ftr),

('Ronda 2 – Método de verificación', 'bureau', 'cuenta', 2, 'You verified this account without providing proof. Please provide your method of verification or delete it.',
 hdr || E'RE: Request for Method of Verification – Second Dispute\n\nTo Whom It May Concern:\n\nI previously disputed the items below and you reported them as "verified." I do not believe a reasonable investigation was performed.\n\n{{lista_items}}\n\nPursuant to 15 U.S.C. § 1681i(a)(7), I request a description of the procedure used to determine the accuracy and completeness of each item, including the name, address and telephone number of every furnisher contacted. If you cannot provide this information, the items must be deleted from my credit file.' || ftr),

('Ronda 3 – Aviso final', 'bureau', 'cuenta', 3, 'This item remains inaccurate after two disputes and must be deleted.',
 hdr || E'RE: Final Notice – Continued Reporting of Unverified Information\n\nTo Whom It May Concern:\n\nThis is my third request regarding the items listed below. Despite my previous disputes, these items continue to appear in my credit file without proper verification.\n\n{{lista_items}}\n\nContinued reporting of inaccurate or unverifiable information may violate the Fair Credit Reporting Act, 15 U.S.C. §§ 1681e(b) and 1681i. If these items are not corrected or deleted, I intend to file a complaint with the Consumer Financial Protection Bureau and my state Attorney General.' || ftr),

('Información personal incorrecta', 'bureau', 'personal', 1, 'This information does not belong to me / is outdated.',
 hdr || E'RE: Request to Correct Personal Information\n\nTo Whom It May Concern:\n\nMy credit file contains personal information that is incorrect or does not belong to me. Please remove the following:\n\n{{lista_items}}\n\nMy only correct name, address and date of birth are shown at the top of this letter. Please update my file under 15 U.S.C. § 1681i and send me confirmation of the changes.' || ftr),

('Inquiries no autorizadas', 'bureau', 'inquiry', 1, 'I did not authorize this inquiry.',
 hdr || E'RE: Request to Remove Unauthorized Inquiries\n\nTo Whom It May Concern:\n\nI reviewed my credit report and found the following hard inquiries that I do not recognize and did not authorize:\n\n{{lista_items}}\n\nUnder 15 U.S.C. § 1681b, a consumer report may only be furnished for a permissible purpose. Please verify that each company had a permissible purpose, or remove these inquiries from my credit file.' || ftr),

('Validación de deuda (a la agencia de cobro)', 'acreedor', 'cuenta', 1, 'Please validate this debt.',
 hdr || E'RE: Debt Validation Request\n\nTo Whom It May Concern:\n\nI am requesting validation of the following alleged debt pursuant to the Fair Debt Collection Practices Act, 15 U.S.C. § 1692g:\n\n{{lista_items}}\n\nPlease provide: (1) the amount of the debt and how it was calculated; (2) the name and address of the original creditor; (3) a copy of any signed agreement; and (4) proof that you are licensed to collect in my state. Until this debt is validated, please cease collection activity and do not report it to the credit bureaus, or remove it if already reported.' || ftr),

('Carta de buena voluntad (pagos tarde)', 'acreedor', 'cuenta', 1, 'Request goodwill removal of the late payment(s).',
 hdr || E'RE: Goodwill Adjustment Request\n\nDear Customer Service Team,\n\nI am writing regarding the account below. I value my relationship with your company and I have worked hard to keep my account in good standing.\n\n{{lista_items}}\n\nThe late payment(s) shown were an isolated situation that does not reflect my payment history. I respectfully ask that, as a gesture of goodwill, you remove the late payment notations reported to the credit bureaus. Thank you for your consideration.' || ftr);
end if;
end $$;

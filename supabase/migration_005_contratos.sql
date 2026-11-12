-- =====================================================================
--  CreditRep · Migración 005 · Contrato CROA + autorización FCRA
--  - cr_consents: lo que el cliente firmó (copia exacta), fecha límite para cancelar
--  - días hábiles: lunes a viernes sin feriados federales (conservador: la espera es más larga)
--  - una carta no se puede marcar como enviada sin contrato firmado y vigente,
--    ni antes de que pasen los 3 días hábiles (15 U.S.C. §1679d(a)(2))
--  Aditiva: no cambia nada de lo que ya existe.
-- =====================================================================

-- 1) Feriados federales de EE. UU. (con el día observado si cae en fin de semana)
create or replace function public.cr_us_holiday(d date) returns boolean
language plpgsql immutable set search_path = '' as $$
declare y int := extract(year from d); m int := extract(month from d);
        nth date; obs date; fixed date;
begin
  -- feriados de fecha fija y su día observado
  foreach fixed in array array[make_date(y,1,1), make_date(y,6,19), make_date(y,7,4), make_date(y,11,11), make_date(y,12,25), make_date(y+1,1,1)] loop
    obs := case extract(dow from fixed) when 6 then fixed - 1 when 0 then fixed + 1 else fixed end;
    if d = fixed or d = obs then return true; end if;
  end loop;
  -- n-ésimo lunes / jueves
  if m = 1 then nth := make_date(y,1,1) + ((8 - extract(dow from make_date(y,1,1))::int) % 7) + 14; if d = nth then return true; end if; end if;   -- MLK: 3er lunes
  if m = 2 then nth := make_date(y,2,1) + ((8 - extract(dow from make_date(y,2,1))::int) % 7) + 14; if d = nth then return true; end if; end if;   -- Presidentes: 3er lunes
  if m = 5 then nth := make_date(y,5,31) - ((extract(dow from make_date(y,5,31))::int + 6) % 7); if d = nth then return true; end if; end if;     -- Memorial: último lunes
  if m = 9 then nth := make_date(y,9,1) + ((8 - extract(dow from make_date(y,9,1))::int) % 7); if d = nth then return true; end if; end if;          -- Trabajo: 1er lunes
  if m = 10 then nth := make_date(y,10,1) + ((8 - extract(dow from make_date(y,10,1))::int) % 7) + 7; if d = nth then return true; end if; end if; -- Colón: 2º lunes
  if m = 11 then nth := make_date(y,11,1) + ((11 - extract(dow from make_date(y,11,1))::int) % 7) + 21; if d = nth then return true; end if; end if; -- Acción de Gracias: 4º jueves
  return false;
end $$;

-- 2) El n-ésimo día hábil después de d (d no cuenta)
create or replace function public.cr_business_days_after(d date, n int) returns date
language plpgsql immutable set search_path = '' as $$
declare x date := d; k int := 0;
begin
  while k < n loop
    x := x + 1;
    if extract(dow from x) not in (0, 6) and not public.cr_us_holiday(x) then k := k + 1; end if;
  end loop;
  return x;
end $$;

-- 3) Contratos firmados (se guardan 2 años aunque se borre el cliente: §1679c(c))
create table if not exists public.cr_consents (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.cr_clients(id) on delete set null,
  client_name      text,
  version          text not null,
  signed_name      text not null,
  signed_at        timestamptz not null default now(),
  user_agent       text,
  disclosure_html  text not null,   -- "Consumer Credit File Rights" (documento aparte)
  contract_html    text not null,   -- contrato + autorización FCRA + aviso de cancelación
  cancel_deadline  date not null,   -- puede cancelar hasta la medianoche de este día
  can_start_at     timestamptz not null,
  cancelled_at     timestamptz,
  cancelled_by     text,            -- cliente | admin
  cancel_reason    text,
  created_at       timestamptz not null default now()
);
create index if not exists cr_consents_client_idx on public.cr_consents(client_id);
alter table public.cr_consents enable row level security;
drop policy if exists admin_all on public.cr_consents;
create policy admin_all on public.cr_consents for all to authenticated using (public.cr_is_admin()) with check (public.cr_is_admin());
drop policy if exists client_consents_select on public.cr_consents;
create policy client_consents_select on public.cr_consents for select to authenticated using (client_id = public.cr_my_client_id());

-- 4) Firmar (solo el cliente, desde el portal)
create or replace function public.cr_sign_consent(p_name text, p_version text, p_disclosure text, p_contract text, p_user_agent text)
returns public.cr_consents
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public.cr_my_client_id(); r public.cr_consents; sign_day date; dl date; cname text;
begin
  if cid is null then raise exception 'Solo el cliente puede firmar su contrato'; end if;
  if length(trim(coalesce(p_name, ''))) < 5 then raise exception 'Escribe tu nombre completo para firmar'; end if;
  if length(coalesce(p_disclosure, '')) < 200 or length(coalesce(p_contract, '')) < 500 then raise exception 'Falta el texto del contrato'; end if;
  if exists (select 1 from public.cr_consents where client_id = cid and cancelled_at is null) then raise exception 'Ya firmaste tu contrato'; end if;
  sign_day := (now() at time zone 'America/New_York')::date;
  dl := public.cr_business_days_after(sign_day, 3);
  -- el aviso de cancelación que vio el cliente debe tener la misma fecha límite que guarda el servidor
  if position(to_char(dl, 'MM/DD/YYYY') in p_contract) = 0 then
    raise exception 'La fecha límite cambió (pasó la medianoche). Cierra y vuelve a abrir el contrato para firmar.';
  end if;
  select trim(concat_ws(' ', first_name, middle_name, last_name)) into cname from public.cr_clients where id = cid;
  insert into public.cr_consents (client_id, client_name, version, signed_name, user_agent, disclosure_html, contract_html, cancel_deadline, can_start_at)
  values (cid, cname, p_version, trim(p_name), left(p_user_agent, 300), p_disclosure, p_contract, dl,
          -- medianoche del día límite en la hora del Pacífico: la más tarde de EE. UU. continental
          ((dl + 1)::timestamp at time zone 'America/Los_Angeles'))
  returning * into r;
  insert into public.cr_activity(client_id, message) values (cid, '📝 El cliente firmó el contrato y la autorización. Puede cancelar hasta el ' || to_char(dl, 'MM/DD/YYYY'));
  return r;
end $$;
revoke all on function public.cr_sign_consent(text, text, text, text, text) from public, anon;
grant execute on function public.cr_sign_consent(text, text, text, text, text) to authenticated;

-- 5) Cancelar (el cliente desde el portal, o el admin si el aviso llegó por correo)
create or replace function public.cr_cancel_consent(p_reason text, p_client uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid; who text;
begin
  if public.cr_is_admin() and p_client is not null then cid := p_client; who := 'admin';
  else cid := public.cr_my_client_id(); who := 'cliente'; end if;
  if cid is null then raise exception 'No autorizado'; end if;
  update public.cr_consents set cancelled_at = now(), cancelled_by = who, cancel_reason = left(p_reason, 500)
   where client_id = cid and cancelled_at is null;
  if not found then raise exception 'No hay un contrato vigente para cancelar'; end if;
  insert into public.cr_activity(client_id, message) values (cid, '⛔ Contrato cancelado por ' || who || coalesce(': ' || nullif(trim(p_reason), ''), ''));
end $$;
revoke all on function public.cr_cancel_consent(text, uuid) from public, anon;
grant execute on function public.cr_cancel_consent(text, uuid) to authenticated;

-- 6) Ninguna carta sale sin contrato vigente y sin pasar los 3 días hábiles
create or replace function public.cr_letters_require_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'enviada' and (tg_op = 'INSERT' or old.status is distinct from 'enviada') then
    if not exists (select 1 from public.cr_consents
                    where client_id = new.client_id and cancelled_at is null and can_start_at <= now()) then
      raise exception 'No se puede enviar: el cliente no ha firmado el contrato, lo canceló, o todavía no pasan los 3 días hábiles para cancelar';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.cr_letters_require_consent() from public, anon, authenticated;
drop trigger if exists cr_letters_consent on public.cr_letters;
create trigger cr_letters_consent before insert or update on public.cr_letters
  for each row execute function public.cr_letters_require_consent();

-- =====================================================================
-- 005c · Después de la auditoría de ChatGPT (13-nov): un solo contrato vigente,
-- el servidor revisa el texto que se firma, y "enviada" + ronda en una transacción.
-- (Aplicada en la base como migration_005c_validar_contrato_y_envio; la versión
--  completa de cr_sign_consent de ahí reemplaza la de arriba.)
-- =====================================================================
create unique index if not exists cr_consents_one_active on public.cr_consents(client_id) where cancelled_at is null;

create or replace function public.cr_html_esc(s text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(s, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function public.cr_sign_consent(p_name text, p_version text, p_disclosure text, p_contract text, p_user_agent text)
returns public.cr_consents
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public.cr_my_client_id(); r public.cr_consents; sign_day date; dl date; cname text; st record;
begin
  if cid is null then raise exception 'Solo el cliente puede firmar su contrato'; end if;
  if length(trim(coalesce(p_name, ''))) < 5 then raise exception 'Escribe tu nombre completo para firmar'; end if;
  if p_version is distinct from '2026-11-13' then raise exception 'Versión de contrato desconocida. Recarga la página.'; end if;
  if exists (select 1 from public.cr_consents where client_id = cid and cancelled_at is null) then raise exception 'Ya firmaste tu contrato'; end if;
  if not exists (select 1 from public.cr_items where client_id = cid) then raise exception 'Tu contrato estará listo cuando revisemos tu reporte de crédito'; end if;
  if p_contract ~* '<\s*(script|iframe|object|embed|link|meta|form)|javascript:|\son[a-z]+\s*=' or p_disclosure ~* '<\s*(script|iframe|object|embed|link|meta|form)|javascript:|\son[a-z]+\s*=' then
    raise exception 'El contrato tiene contenido no permitido';
  end if;
  if position('Consumer Credit File Rights Under State and Federal Law' in p_disclosure) = 0
     or position('You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it.' in p_disclosure) = 0
     or position('Washington, D.C. 20580' in p_disclosure) = 0 then
    raise exception 'Falta el documento de derechos completo';
  end if;
  if position('You may cancel this contract without penalty or obligation at any time before midnight of the 3rd business day after the date on which you signed the contract. See the attached notice of cancellation form for an explanation of this right.' in p_contract) = 0
     or (length(p_contract) - length(replace(p_contract, 'Notice of Cancellation', ''))) / length('Notice of Cancellation') < 2
     or position('I hereby cancel this transaction,' in p_contract) = 0
     or position('No garantizamos ningún resultado' in p_contract) = 0 then
    raise exception 'Faltan partes obligatorias del contrato';
  end if;
  select company_name, company_address into st from public.cr_settings where id = 1;
  if coalesce(trim(st.company_name), '') in ('', 'Mi Empresa de Crédito') or coalesce(trim(st.company_address), '') = ''
     or position(public.cr_html_esc(st.company_name) in p_contract) = 0
     or position(public.cr_html_esc(split_part(st.company_address, E'\n', 1)) in p_contract) = 0 then
    raise exception 'El contrato no tiene el nombre o la dirección de la empresa';
  end if;
  sign_day := (now() at time zone 'America/New_York')::date;
  dl := public.cr_business_days_after(sign_day, 3);
  if position(to_char(dl, 'MM/DD/YYYY') in p_contract) = 0 then
    raise exception 'La fecha límite cambió (pasó la medianoche). Cierra y vuelve a abrir el contrato para firmar.';
  end if;
  select trim(concat_ws(' ', first_name, middle_name, last_name)) into cname from public.cr_clients where id = cid;
  insert into public.cr_consents (client_id, client_name, version, signed_name, user_agent, disclosure_html, contract_html, cancel_deadline, can_start_at)
  values (cid, cname, p_version, trim(p_name), left(p_user_agent, 300), p_disclosure, p_contract, dl,
          ((dl + 1)::timestamp at time zone 'America/Los_Angeles'))
  returning * into r;
  insert into public.cr_activity(client_id, message) values (cid, '📝 El cliente firmó el contrato y la autorización. Puede cancelar hasta el ' || to_char(dl, 'MM/DD/YYYY'));
  return r;
end $$;
revoke all on function public.cr_sign_consent(text, text, text, text, text) from public, anon;
grant execute on function public.cr_sign_consent(text, text, text, text, text) to authenticated;

create or replace function public.cr_mark_letters_sent(p_ids uuid[], p_sent_at date, p_tracking text default null, p_set_tracking boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.cr_is_admin() then raise exception 'Solo administradores'; end if;
  with newly as (
    select l.round, l.item_ids from public.cr_letters l
     where l.id = any(p_ids) and l.status is distinct from 'enviada' and l.recipient_type = 'bureau'
  ), per_item as (
    select unnest(item_ids) as item_id, max(coalesce(round, 1)) as rnd from newly group by 1
  )
  update public.cr_items i set status = 'en_disputa', dispute_round = greatest(i.dispute_round, p.rnd), last_dispute_at = p_sent_at
    from per_item p where i.id = p.item_id and i.status <> 'eliminada';
  update public.cr_letters set status = 'enviada', sent_at = p_sent_at,
         tracking_number = case when p_set_tracking then nullif(p_tracking, '') else tracking_number end
   where id = any(p_ids);
end $$;
revoke all on function public.cr_mark_letters_sent(uuid[], date, text, boolean) from public, anon;
grant execute on function public.cr_mark_letters_sent(uuid[], date, text, boolean) to authenticated;

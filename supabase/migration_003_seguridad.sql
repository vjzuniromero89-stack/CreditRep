-- =====================================================================
--  CreditRep · Migración 003 · Seguridad (rama v2-aprobacion-lob)
--  Es ADITIVA: la app que está hoy en main sigue funcionando igual.
--  - SSN cifrado (pgcrypto + llave en el Vault de Supabase) y últimos 4 aparte
--  - registro público cerrado
--  - el cliente no puede borrar documentos que subió el admin
--  - límite de tamaño de archivos
--  El texto plano de cr_clients.ssn se borra DESPUÉS del merge (migration_004).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) Columnas nuevas ---------------------------------------------------
alter table public.cr_clients add column if not exists ssn_last4 text;
alter table public.cr_clients add column if not exists ssn_enc   text;

-- 2) Llave en el Vault (se genera dentro de la base; nadie la ve) --------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cr_ssn_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'cr_ssn_key', 'Llave para cifrar el SSN de cr_clients');
  end if;
end $$;

create or replace function public.cr_ssn_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cr_ssn_key' limit 1;
$$;
revoke all on function public.cr_ssn_key() from public, anon, authenticated;

-- 3) Cifrar lo que ya existe (antes de crear el trigger) -----------------
update public.cr_clients
   set ssn_enc   = encode(extensions.pgp_sym_encrypt(regexp_replace(ssn, '\D', '', 'g'), public.cr_ssn_key()), 'base64'),
       ssn_last4 = right(regexp_replace(ssn, '\D', '', 'g'), 4)
 where coalesce(regexp_replace(ssn, '\D', '', 'g'), '') <> '' and ssn_enc is null;

-- 4) Trigger: todo SSN que se escriba se cifra; ssn_enc/ssn_last4 no se escriben a mano
create or replace function public.cr_encrypt_ssn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d text;
begin
  if tg_op = 'UPDATE' and new.ssn is not distinct from old.ssn then
    new.ssn_enc := old.ssn_enc; new.ssn_last4 := old.ssn_last4;
    return new;
  end if;
  d := regexp_replace(coalesce(new.ssn, ''), '\D', '', 'g');
  if d = '' then
    -- vacío: se queda el cifrado anterior (en la fase 2 el texto plano se borra a propósito)
    if tg_op = 'UPDATE' then new.ssn_enc := old.ssn_enc; new.ssn_last4 := old.ssn_last4;
    else new.ssn_enc := null; new.ssn_last4 := null; end if;
    return new;
  end if;
  new.ssn_enc   := encode(extensions.pgp_sym_encrypt(d, public.cr_ssn_key()), 'base64');
  new.ssn_last4 := right(d, 4);
  return new;
end $$;
revoke all on function public.cr_encrypt_ssn() from public, anon, authenticated;
drop trigger if exists cr_clients_ssn on public.cr_clients;
create trigger cr_clients_ssn before insert or update on public.cr_clients
  for each row execute function public.cr_encrypt_ssn();

-- 5) Ver el SSN completo: solo admin, y queda en el historial ------------
create or replace function public.cr_reveal_ssn(p_client uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare e text; d text;
begin
  if not public.cr_is_admin() then raise exception 'Solo administradores'; end if;
  select ssn_enc into e from public.cr_clients where id = p_client;
  if e is null then return null; end if;
  d := extensions.pgp_sym_decrypt(decode(e, 'base64'), public.cr_ssn_key());
  insert into public.cr_activity(client_id, message) values (p_client, '🔒 Un administrador vio el Seguro Social completo');
  return substr(d, 1, 3) || '-' || substr(d, 4, 2) || '-' || substr(d, 6, 4);
end $$;
revoke all on function public.cr_reveal_ssn(uuid) from public, anon;
grant execute on function public.cr_reveal_ssn(uuid) to authenticated;

-- 6) Registro público cerrado --------------------------------------------
alter table public.cr_settings alter column allow_public_signup set default false;
update public.cr_settings set allow_public_signup = false where id = 1;

-- 7) Documentos ----------------------------------------------------------
-- el cliente solo registra archivos dentro de su carpeta docs/
drop policy if exists client_docs_insert on public.cr_documents;
create policy client_docs_insert on public.cr_documents for insert to authenticated
  with check (client_id = public.cr_my_client_id() and uploaded_by = 'cliente'
              and file_path like public.cr_my_client_id()::text || '/docs/%');

-- el cliente solo borra archivos que subió él (no la licencia o el bill que subió el admin).
-- Se usa el dueño del archivo en Storage, no cr_documents: el cliente podría crear una fila
-- falsa con la ruta de un archivo del admin (auditoría de ChatGPT, 13-nov).
drop policy if exists cr_files_client_delete on storage.objects;
create policy cr_files_client_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cr-files'
         and (storage.foldername(name))[1] = public.cr_my_client_id()::text
         and (storage.foldername(name))[2] = 'docs'
         and owner_id = (select auth.uid())::text);

-- archivos de máximo 25 MB
update storage.buckets set file_size_limit = 26214400 where id = 'cr-files';

-- =====================================================================
--  CreditRep · Migración 004 · Correr SOLO después de hacer merge de v2 a main
--  (antes rompería la app de main, que todavía lee cr_clients.ssn en texto plano).
--  Borra el SSN en texto plano: desde aquí solo existe cifrado (ssn_enc) + ssn_last4.
-- =====================================================================

-- 1) El trigger cifra y deja el texto plano vacío
create or replace function public.cr_encrypt_ssn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d text;
begin
  d := regexp_replace(coalesce(new.ssn, ''), '\D', '', 'g');
  if d = '' then
    if tg_op = 'UPDATE' then new.ssn_enc := old.ssn_enc; new.ssn_last4 := old.ssn_last4;
    else new.ssn_enc := null; new.ssn_last4 := null; end if;
  else
    new.ssn_enc   := encode(extensions.pgp_sym_encrypt(d, public.cr_ssn_key()), 'base64');
    new.ssn_last4 := right(d, 4);
  end if;
  new.ssn := null;
  return new;
end $$;

-- 2) Confirmar que todo lo que hay está cifrado, y borrar el texto plano
do $$
begin
  if exists (select 1 from public.cr_clients
              where coalesce(regexp_replace(ssn, '\D', '', 'g'), '') <> ''
                and (ssn_enc is null or extensions.pgp_sym_decrypt(decode(ssn_enc, 'base64'), public.cr_ssn_key()) <> regexp_replace(ssn, '\D', '', 'g'))) then
    raise exception 'Hay un SSN que no está bien cifrado: no se borra nada';
  end if;
end $$;
update public.cr_clients set ssn = null where ssn is not null;

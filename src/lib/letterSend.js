import { supabase } from './supabase';
import { today } from './format';
import { consentState } from './consent';

// Clientes de estas cartas que todavía no permiten enviar (sin firmar, cancelado o en los 3 días hábiles)
export async function clientsBlocked(clientIds) {
  const ids = [...new Set(clientIds)].filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('cr_consents').select('client_id,cancelled_at,can_start_at').in('client_id', ids).is('cancelled_at', null);
  if (error) throw error;
  const ok = new Set((data || []).filter((r) => consentState(r) === 'vigente').map((r) => r.client_id));
  return ids.filter((id) => !ok.has(id));
}

// La ronda de cada cuenta sube cuando la carta SALE, no cuando se genera.
// Todo pasa en una sola transacción en la base (cr_mark_letters_sent): si el contrato no lo permite,
// el trigger rechaza la carta y no se cambia ninguna ronda.
export async function markLettersSent(letters, { sentAt = today(), tracking } = {}) {
  if (!letters.length) return;
  if ((await clientsBlocked(letters.map((l) => l.client_id))).length) {
    throw new Error('No se puede enviar: el cliente no ha firmado el contrato, lo canceló, o todavía no pasan los 3 días hábiles para cancelar.');
  }
  const { error } = await supabase.rpc('cr_mark_letters_sent', {
    p_ids: letters.map((l) => l.id), p_sent_at: sentAt, p_tracking: tracking ?? null, p_set_tracking: tracking !== undefined,
  });
  if (error) throw error;
}

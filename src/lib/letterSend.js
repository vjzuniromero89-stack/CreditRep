import { supabase } from './supabase';
import { today } from './format';
import { roundUpdates } from './packageBuilder';

// La ronda de cada cuenta sube cuando la carta SALE, no cuando se genera.
// Así, borrar una carta que nunca se mandó no deja la cuenta en una ronda que no pasó.
// Orden: primero las cuentas y al final la carta. Si algo falla a medias, la carta sigue sin
// "enviada" y al reintentar se repite todo; Math.max hace que repetir no suba la ronda dos veces.
export async function markLettersSent(letters, { sentAt = today(), tracking } = {}) {
  if (!letters.length) return;
  const upd = roundUpdates(letters.filter((l) => l.status !== 'enviada'));
  if (upd.size) {
    const { data: items, error: e2 } = await supabase.from('cr_items').select('id,status,dispute_round').in('id', [...upd.keys()]);
    if (e2) throw e2;
    // shortcut: leer y escribir no es atómico; con dos admins enviando a la vez la ronda podría quedar baja. Pasar a un RPC si hay más de un admin.
    const res = await Promise.all((items || []).filter((i) => i.status !== 'eliminada').map((i) => supabase.from('cr_items')
      .update({ status: 'en_disputa', dispute_round: Math.max(i.dispute_round || 0, upd.get(i.id)), last_dispute_at: sentAt }).eq('id', i.id)));
    const bad = res.find((r) => r.error);
    if (bad) throw bad.error;
  }
  const patch = { status: 'enviada', sent_at: sentAt };
  if (tracking !== undefined) patch.tracking_number = tracking || null;
  const { error } = await supabase.from('cr_letters').update(patch).in('id', letters.map((l) => l.id));
  if (error) throw error;
}

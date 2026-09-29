import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LETTER_STATUS } from '../../lib/constants';
import { fullName } from '../../lib/format';
import { Input, PageHeader, Select, Spinner } from '../../components/ui';
import LettersTable from '../../components/LettersTable';

export default function Letters() {
  const [letters, setLetters] = useState(null);
  const [names, setNames] = useState({});
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const load = async () => {
    const [l, c] = await Promise.all([
      supabase.from('cr_letters').select('*').order('created_at', { ascending: false }),
      supabase.from('cr_clients').select('id,first_name,middle_name,last_name'),
    ]);
    setLetters(l.data || []);
    setNames(Object.fromEntries((c.data || []).map((x) => [x.id, fullName(x)])));
  };
  useEffect(() => { load(); }, []);
  if (!letters) return <Spinner />;
  const list = letters.filter((l) => (!status || l.status === status) && (!q || (names[l.client_id] || '').toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <PageHeader title="Cartas" subtitle="Todas las cartas generadas. Para crear nuevas, entra a un cliente → Generar cartas." />
      <div className="flex flex-wrap gap-2">
        <Input className="w-full sm:w-64" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(LETTER_STATUS).map(([k, x]) => [k, x.label])} placeholder="Todos los estados" />
      </div>
      <LettersTable letters={list} clients={names} showClient onReload={load} />
    </div>
  );
}

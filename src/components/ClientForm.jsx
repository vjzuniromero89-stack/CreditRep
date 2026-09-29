import { Field, Input, Select, Textarea } from './ui';
import { US_STATES } from '../lib/constants';

// Formulario de información personal (lo usan el admin y el portal del cliente)
export default function ClientForm({ value, onChange, showSSNFull = true, compact }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const v = (k) => value[k] ?? '';
  const fmtSSN = (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 9);
    const f = d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
    onChange({ ...value, ssn: f });
  };
  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-3 text-sm font-semibold text-slate-700">Datos personales</h4>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Nombre" className="sm:col-span-1"><Input value={v('first_name')} onChange={set('first_name')} required /></Field>
          <Field label="Segundo nombre"><Input value={v('middle_name')} onChange={set('middle_name')} /></Field>
          <Field label="Apellido(s)"><Input value={v('last_name')} onChange={set('last_name')} required /></Field>
          <Field label="Sufijo (Jr, Sr)"><Input value={v('suffix')} onChange={set('suffix')} /></Field>
          <Field label="Fecha de nacimiento"><Input type="date" value={v('dob')} onChange={set('dob')} /></Field>
          <Field label="Seguro Social (SSN)"><Input value={v('ssn')} onChange={fmtSSN} inputMode="numeric" placeholder="123-45-6789" type={showSSNFull ? 'text' : 'password'} /></Field>
          <Field label="Teléfono"><Input type="tel" value={v('phone')} onChange={set('phone')} /></Field>
          <Field label="Teléfono 2"><Input type="tel" value={v('phone2')} onChange={set('phone2')} /></Field>
          <Field label="Email" className="sm:col-span-2"><Input type="email" value={v('email')} onChange={set('email')} /></Field>
          <Field label="Empleador" className="sm:col-span-2"><Input value={v('employer')} onChange={set('employer')} /></Field>
        </div>
      </section>
      <section>
        <h4 className="mb-3 text-sm font-semibold text-slate-700">Dirección actual</h4>
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Calle y número" className="sm:col-span-4"><Input value={v('address')} onChange={set('address')} /></Field>
          <Field label="Apto / Unidad" className="sm:col-span-2"><Input value={v('address2')} onChange={set('address2')} /></Field>
          <Field label="Ciudad" className="sm:col-span-3"><Input value={v('city')} onChange={set('city')} /></Field>
          <Field label="Estado" className="sm:col-span-1"><Select value={v('state')} onChange={set('state')} options={US_STATES} placeholder="—" /></Field>
          <Field label="ZIP" className="sm:col-span-2"><Input value={v('zip')} onChange={set('zip')} inputMode="numeric" /></Field>
          {!compact && <Field label="Direcciones anteriores (una por línea)" className="sm:col-span-6"><Textarea rows={2} value={v('prev_address')} onChange={set('prev_address')} /></Field>}
        </div>
      </section>
    </div>
  );
}

// Contrato CROA (15 U.S.C. §1679c, §1679d, §1679e) + autorización para disputar + firma electrónica.
// Los textos en inglés entre comillas son los que exige la ley, palabra por palabra.
// Esto NO es asesoría legal: Victor debe revisarlo con un abogado de su estado.
import { esc } from './format.js';

export const CONSENT_VERSION = '2026-11-13';   // si cambia, cambiarla también en cr_sign_consent
export const SIGN_HERE = '<!--FIRMA-->';

const FEES = [
  ['fee_coleccion', 'Colección', (i) => i.kind === 'cuenta' && i.category === 'coleccion'],
  ['fee_charge_off', 'Charge-off', (i) => i.kind === 'cuenta' && i.category === 'charge_off'],
  ['fee_pagos_tarde', 'Pagos tarde', (i) => i.kind === 'cuenta' && i.category === 'pagos_tarde'],
  ['fee_repo', 'Repo / embargo', (i) => i.kind === 'cuenta' && i.category === 'repo'],
  ['fee_registro_publico', 'Registro público', (i) => i.kind === 'cuenta' && i.category === 'registro_publico'],
  ['fee_otro_negativo', 'Otro negativo', (i) => i.kind === 'cuenta' && i.is_negative && !['coleccion', 'charge_off', 'pagos_tarde', 'repo', 'registro_publico'].includes(i.category)],
  ['fee_inquiry', 'Consulta (inquiry)', (i) => i.kind === 'inquiry'],
  ['fee_personal', 'Dato personal viejo (nombre, dirección, teléfono)', (i) => i.kind === 'personal'],
];
const usd = (n) => '$' + Number(n || 0).toFixed(2);

// Estado del contrato de un cliente (la fila más reciente de cr_consents)
export function consentState(row, now = new Date()) {
  if (!row) return 'sin_firmar';
  if (row.cancelled_at) return 'cancelado';
  if (new Date(row.can_start_at) > now) return 'espera';   // dentro de los 3 días hábiles para cancelar
  return 'vigente';
}
export const CONSENT_LABEL = {
  sin_firmar: ['Sin firmar', 'bg-red-100 text-red-800 ring-red-200'],
  espera: ['Firmado · en los 3 días para cancelar', 'bg-amber-100 text-amber-800 ring-amber-200'],
  vigente: ['Firmado y vigente', 'bg-emerald-100 text-emerald-800 ring-emerald-200'],
  cancelado: ['Cancelado', 'bg-slate-200 text-slate-700 ring-slate-300'],
};

// ¿Se puede firmar? La ley pide el nombre y la dirección principal de la empresa en el contrato.
export function companyReady(settings) {
  const name = (settings?.company_name || '').trim();
  return !!name && name !== 'Mi Empresa de Crédito' && !!(settings?.company_address || '').trim();
}

// Fecha de hoy en Nueva York (YYYY-MM-DD): el servidor calcula el límite con la misma zona
export function todayNewYork(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const mdy = (iso) => { const [y, m, d] = String(iso).split('-'); return `${m}/${d}/${y}`; };

// Precio por partida y el máximo posible con lo que hoy aparece en el reporte
export function feeTable(settings, items = []) {
  const open = items.filter((i) => i.status !== 'eliminada');
  const rows = FEES.map(([k, label, match]) => {
    const price = Number(settings?.[k] || 0);
    const count = open.filter(match).length;
    return { key: k, label, price, count, subtotal: price * count };
  });
  return { rows, max: rows.reduce((s, r) => s + r.subtotal, 0) };
}

export function disclosureHtml() {
  return `<h2>Consumer Credit File Rights Under State and Federal Law</h2>
<p>You have a right to dispute inaccurate information in your credit report by contacting the credit bureau directly. However, neither you nor any “credit repair” company or credit repair organization has the right to have accurate, current, and verifiable information removed from your credit report. The credit bureau must remove accurate, negative information from your report only if it is over 7 years old. Bankruptcy information can be reported for 10 years.</p>
<p>You have a right to obtain a copy of your credit report from a credit bureau. You may be charged a reasonable fee. There is no fee, however, if you have been turned down for credit, employment, insurance, or a rental dwelling because of information in your credit report within the preceding 60 days. The credit bureau must provide someone to help you interpret the information in your credit file. You are entitled to receive a free copy of your credit report if you are unemployed and intend to apply for employment in the next 60 days, if you are a recipient of public welfare assistance, or if you have reason to believe that there is inaccurate information in your credit report due to fraud.</p>
<p>You have a right to sue a credit repair organization that violates the Credit Repair Organization Act. This law prohibits deceptive practices by credit repair organizations.</p>
<p>You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it.</p>
<p>Credit bureaus are required to follow reasonable procedures to ensure that the information they report is accurate. However, mistakes may occur.</p>
<p>You may, on your own, notify a credit bureau in writing that you dispute the accuracy of information in your credit file. The credit bureau must then reinvestigate and modify or remove inaccurate or incomplete information. The credit bureau may not charge any fee for this service. Any pertinent information and copies of all documents you have concerning an error should be given to the credit bureau.</p>
<p>If the credit bureau’s reinvestigation does not resolve the dispute to your satisfaction, you may send a brief statement to the credit bureau, to be kept in your file, explaining why you think the record is inaccurate. The credit bureau must include a summary of your statement about disputed information with any report it issues about you.</p>
<p>The Federal Trade Commission regulates credit bureaus and credit repair organizations. For more information contact:</p>
<p>The Public Reference Branch<br>Federal Trade Commission<br>Washington, D.C. 20580</p>
<hr>
<h3>Traducción de cortesía al español</h3>
<p><b>Derechos sobre su archivo de crédito según la ley estatal y federal.</b> Usted tiene derecho a disputar información inexacta de su reporte de crédito contactando directamente al buró. Sin embargo, ni usted ni ninguna compañía u organización de reparación de crédito tiene derecho a que se elimine de su reporte información exacta, actual y verificable. El buró solo debe eliminar información negativa exacta si tiene más de 7 años. La información de bancarrota puede reportarse por 10 años.</p>
<p>Usted tiene derecho a obtener una copia de su reporte de un buró, quizá con un cargo razonable. No hay cargo si en los últimos 60 días le negaron crédito, empleo, seguro o una vivienda de alquiler por información de su reporte. El buró debe darle a alguien que le ayude a entender su archivo. Tiene derecho a una copia gratis si está desempleado y piensa buscar empleo en los próximos 60 días, si recibe asistencia pública, o si cree que hay información inexacta por fraude.</p>
<p>Usted tiene derecho a demandar a una organización de reparación de crédito que viole la Ley de Organizaciones de Reparación de Crédito (CROA). Esta ley prohíbe prácticas engañosas.</p>
<p>Usted tiene derecho a cancelar su contrato con cualquier organización de reparación de crédito, por cualquier motivo, dentro de los 3 días hábiles desde la fecha en que lo firmó.</p>
<p>Los burós deben seguir procedimientos razonables para que la información sea exacta, pero puede haber errores.</p>
<p>Usted puede, por su cuenta, avisar por escrito a un buró que disputa la exactitud de su archivo. El buró debe reinvestigar y corregir o eliminar la información inexacta o incompleta, sin cobrarle. Debe darle al buró la información y copias de los documentos que tenga sobre el error.</p>
<p>Si la reinvestigación no resuelve la disputa a su satisfacción, puede mandar al buró una declaración breve explicando por qué cree que el dato es inexacto. El buró debe incluir un resumen de su declaración en los reportes que emita sobre usted.</p>
<p>La Comisión Federal de Comercio (FTC) regula a los burós y a las organizaciones de reparación de crédito: Public Reference Branch, Federal Trade Commission, Washington, D.C. 20580.</p>`;
}

export function contractHtml({ settings, client, items = [], deadlineISO }) {
  const co = esc(settings?.company_name || '');
  const coAddr = esc(settings?.company_address || '').replace(/\n/g, '<br>');
  const contact = [settings?.company_phone, settings?.company_email].filter(Boolean).map(esc).join(' · ');
  const name = esc([client?.first_name, client?.middle_name, client?.last_name, client?.suffix].filter(Boolean).join(' '));
  const addr = esc([[client?.address, client?.address2].filter(Boolean).join(', '), [client?.city, [client?.state, client?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', '));
  const { rows, max } = feeTable(settings, items);
  const deadline = mdy(deadlineISO);
  const feeRows = rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.price ? usd(r.price) : 'Sin costo'}</td><td>${r.count}</td><td>${usd(r.subtotal)}</td></tr>`).join('');
  return `<h2>Contrato de servicios de reparación de crédito</h2>
<p><b>Empresa:</b> ${co}<br><b>Dirección principal:</b> ${coAddr}${contact ? `<br><b>Contacto:</b> ${contact}` : ''}</p>
<p><b>Cliente:</b> ${name}${addr ? `<br><b>Dirección:</b> ${addr}` : ''}</p>

<h3>1. Servicios</h3>
<ol>
<li>Revisar los reportes de crédito que usted nos da (TransUnion, Experian y Equifax) y marcar la información que parece inexacta, incompleta o que no se puede verificar: colecciones, charge-offs, pagos tarde, repos, registros públicos, consultas y datos personales viejos (nombres, direcciones, teléfonos).</li>
<li>Preparar cartas de disputa a cada buró, a su nombre, por rondas: la ronda 1; si algo no se elimina, la ronda 2 unos 30 días después; y si sigue, la ronda 3. Cada carta explica el error concreto que vemos.</li>
<li>Preparar cartas a cobradores o acreedores para pedir la validación de la deuda cuando aplique.</li>
<li>Enviar las cartas por correo certificado con su dirección como remitente, adjuntando copia de su identificación y de un comprobante de dirección. Las cartas solo llevan los últimos 4 dígitos de su Seguro Social.</li>
<li>Comparar cada reporte nuevo que usted nos dé con el anterior y mostrarle en su portal qué se eliminó en cada buró.</li>
</ol>
<p>Usted puede disputar la información de su reporte por su cuenta y sin costo. No le pedimos ni guardamos la contraseña de Credit Karma ni de ninguna otra página.</p>

<h3>2. Sin garantías</h3>
<p>No garantizamos ningún resultado. No podemos eliminar información exacta, actual y verificable. No le prometemos un puntaje de crédito ni un tiempo exacto.</p>

<h3>3. Tiempo estimado</h3>
<p>Entre 3 y 6 meses desde que pasan los 3 días hábiles para cancelar: hasta 3 rondas de unos 30 a 45 días cada una.</p>

<h3>4. Pagos</h3>
<p><b>No le cobramos nada por adelantado.</b> Solo le cobramos por cada partida que un reporte nuevo muestre como eliminada de un buró, después de que el servicio para esa partida esté terminado. Una misma cuenta en 3 burós son 3 partidas. No hay cuota mensual ni otros cargos.</p>
<table><thead><tr><th>Tipo de partida</th><th>Precio por partida eliminada</th><th>Partidas en su reporte hoy</th><th>Máximo</th></tr></thead><tbody>${feeRows}</tbody></table>
<p><b>Total máximo de todos los pagos: ${usd(max)}</b>, si se eliminaran todas las partidas que hoy aparecen en su reporte. Si después aparece algo nuevo que usted quiera disputar, se le pedirá firmar un anexo con el nuevo total antes de trabajar en eso.</p>

<h3>5. Autorización para disputar (Fair Credit Reporting Act)</h3>
<p>Autorizo a ${co} a preparar y enviar, a mi nombre, cartas de disputa a TransUnion, Experian, Equifax y a mis acreedores o cobradores, a usar los reportes de crédito y documentos que yo le doy, y a guardar mi información de forma privada solo para este servicio. Yo reviso que los datos sean ciertos. Puedo retirar esta autorización por escrito en cualquier momento.</p>

<h3>6. Terminar el servicio</h3>
<p>Además del derecho a cancelar de abajo, puedo terminar este contrato en cualquier momento avisando por escrito. Solo pagaría las partidas que ya se hayan eliminado por cartas enviadas antes de mi aviso.</p>

<h3>7. Firma y documentos electrónicos (E-SIGN Act)</h3>
<ul>
<li>Acepto firmar y recibir de forma electrónica este contrato, el documento de derechos, el aviso de cancelación y los avisos sobre mi caso. Este consentimiento cubre todo este servicio.</li>
<li><b>Para verlos necesito:</b> un celular o computadora con internet y un navegador actualizado (Chrome, Safari, Edge o Firefox), y poder abrir o guardar archivos HTML o imprimirlos. Si esto cambia, ${co} me avisará.</li>
<li><b>Copia en papel:</b> puedo pedirla sin costo por escrito a ${co} en la dirección de arriba${settings?.company_email ? ` o a ${esc(settings.company_email)}` : ''}.</li>
<li><b>Retirar este consentimiento:</b> puedo hacerlo en cualquier momento, sin costo, por escrito a la misma dirección. Desde entonces me mandarán todo en papel por correo; el servicio puede tardar más, pero el contrato sigue igual.</li>
<li><b>Cambiar mis datos de contacto:</b> con «Actualizar mi información» en mi portal o avisando por escrito.</li>
</ul>

<p class="croa"><b>You may cancel this contract without penalty or obligation at any time before midnight of the 3rd business day after the date on which you signed the contract. See the attached notice of cancellation form for an explanation of this right.</b></p>
<p class="croa"><b>Usted puede cancelar este contrato sin penalidad ni obligación en cualquier momento antes de la medianoche del 3er día hábil después de la fecha en que lo firmó. Vea el aviso de cancelación adjunto, que explica este derecho.</b></p>
${SIGN_HERE}

${[1, 2].map((n) => `<hr>
<h2>Notice of Cancellation <small>(copia ${n} de 2)</small></h2>
<p><b>You may cancel this contract, without any penalty or obligation, at any time before midnight of the 3rd day which begins after the date the contract is signed by you.</b></p>
<p><b>To cancel this contract, mail or deliver a signed, dated copy of this cancellation notice, or any other written notice to ${co} at ${coAddr.replace(/<br>/g, ', ')} before midnight on ${deadline}</b></p>
<p><b>I hereby cancel this transaction,</b></p>
<p>Date: ______________________</p>
<p>Purchaser’s signature: ______________________</p>
<h3>Aviso de cancelación (traducción)</h3>
<p><b>Usted puede cancelar este contrato, sin penalidad ni obligación, en cualquier momento antes de la medianoche del 3er día que empieza después de la fecha en que lo firmó. Para cancelar, envíe o entregue una copia firmada y fechada de este aviso, o cualquier otro aviso escrito, a ${co} en ${coAddr.replace(/<br>/g, ', ')} antes de la medianoche del ${deadline}. También puede cancelar con el botón «Cancelar mi contrato» de su portal.</b></p>`).join('')}`;
}

// La firma va justo después de la frase en negrita (§1679d(b)(4): "in immediate proximity")
export const addSignature = (html, block) => html.replace(SIGN_HERE, block);

// La firma que se agrega a la copia guardada
export const signatureBlock = (signedName, whenText) => `<p class="firma"><b>Firmado electrónicamente por:</b> ${esc(signedName)}<br><b>Fecha:</b> ${esc(whenText)}</p>`;

# CreditRep — Arquitectura (propuesta 12-nov-2026)

## Resumen
CRM de reparación de crédito. El admin crea al cliente y le manda usuario y contraseña. El cliente llena sus datos, sube su licencia y su bill y conecta o sube su reporte de crédito. El sistema detecta los negativos, arma las rondas 1→2→3 por buró y manda **un sobre certificado por buró por ronda**.
Prototipos interactivos: https://claude.ai/artifact/SLx4YnCqWvqzFN2xXEeyC8

## Stack (se queda el actual)
Vite + React + Tailwind · Supabase (Postgres, Auth, Storage, RLS) · funciones de Vercel en `api/` · pdfjs para leer los reportes.
No se migra a Next.js: la app ya funciona y el cambio no aporta nada a estas funciones.

## Decisiones
| Tema | Decisión | Motivo |
|---|---|---|
| Credit Karma | **No** se conecta | No tiene API. Sus términos prohíben compartir la contraseña. Solo trae TransUnion y Equifax. |
| Reporte | SmartCredit por API (llave de empresa) o PDF subido (AnnualCreditReport, IdentityIQ, SmartCredit) | Así no se guardan contraseñas de terceros. |
| Correo certificado | Camino A: SimpleCertifiedMail (tú imprimes). Caminos B y C: API de LetterStream o Click2Mail (Lob como alternativa) | Los tres incluyen recibo electrónico. Precio aprox. $10.4–11.6 por sobre. |
| Agrupación | 1 carta y 1 sobre por buró por ronda, con todas las cuentas, direcciones y nombres | 3 sobres por ronda en vez de N×3. |
| Adjuntos | Reglas en el servidor: el buró recibe licencia, bill y el SSN completo en la carta. Si hay datos personales viejos, el bill es obligatorio. Si la licencia tiene una dirección vieja, va una segunda prueba. Al cobrador solo los últimos 4. | Para que no dependa de banderas fijas en cada plantilla. |
| La ronda sube | Cuando el sobre **se envía**, no cuando se genera | Hoy sube al generar (bug). |

## Cambios al modelo de datos
- `cr_clients.ssn` → cifrado (Supabase Vault o pgcrypto con la llave en el servidor). El navegador del admin solo recibe los últimos 4; el número completo se ve con un clic y queda registrado.
- Vista o columnas separadas para que el cliente no lea `notes`, `monthly_fee`, `status` ni `fee`.
- `cr_mailings` (nueva): `client_id`, `bureau`, `round`, `letter_ids[]`, `provider`, `provider_id`, `tracking`, `status` (en cola → enviado → entregado → devuelto), `cost`, `return_receipt_path`, `sent_at`, `delivered_at`.
- `cr_items`: agregar `result` por ronda (borrado / verificado / actualizado / sin respuesta).
- `cr_attachment_rules` (o JSON en `cr_settings`) con las reglas de adjuntos.

## Rutas nuevas (`api/`, todas solo para admin salvo el webhook)
- `POST /api/mail-send`: junta en un PDF la carta y los adjuntos de un buró y lo manda a la API de correo.
- `POST /api/mail-webhook`: recibe el estado y el recibo firmado del proveedor (con la firma verificada).
- `POST /api/report-import`: trae el reporte de SmartCredit por API.
- `GET /api/ssn-reveal`: muestra el SSN completo y lo registra en `cr_activity`.

## Seguridad (antes de tener clientes reales)
1. Cifrar el SSN y dejar de mandarlo completo en las listas.
2. Bloquear el reset de contraseña para `@clientes.creditopro.app`, o confirmar que el dominio es tuyo.
3. Apagar `allow_public_signup` o ponerle límite y captcha.
4. Límite de tamaño y tipos en el bucket `cr-files`. El cliente no puede borrar lo que subió el admin.
5. Contraseñas de 10 caracteres o más y cambio obligatorio en el primer ingreso.
6. Encabezados de seguridad (CSP) en `vercel.json`.

## Bugs que hay que arreglar primero (revisión 12-nov)
1. No se puede editar una cuenta existente: `ItemsTable.jsx:32` agrega `_g` al objeto y se manda en el update.
2. El reporte nuevo marca como borrado y cobra todo lo que no encuentra (`reportDiff.js:85-92`). Debe quedar para revisión y no cobrar solo.
3. Borrar una cuenta positiva le cobra al cliente (`ItemForm.jsx:67,77-79`).
4. La ronda sube al generar las cartas (`PackageBuilder.jsx:62-65`, `LetterWizard.jsx:86-87`).
5. Los cambios de categoría hechos al importar se pierden en la importación siguiente (`ImportReport.jsx:79`).
6. Un mismo buró puede imprimirse en varios sobres (`PrintLetters.jsx:68-73`).

## Ley (CROA)
Contrato escrito, aviso de 3 días para cancelar, el aviso «Consumer Credit File Rights» y **no cobrar antes de hacer el trabajo**. El cobro por eliminación que ya tiene la app cumple con eso.

## Plan por fases
| Fase | Qué | Termina con |
|---|---|---|
| 0 | Seguridad y los 6 bugs | Se edita una cuenta, el SSN va cifrado, el import no cobra solo |
| 1 | Una carta por buró por ronda, reglas de adjuntos, la ronda sube al enviar | Paquete de 3 PDF listos (camino A) |
| 2 | Correo certificado por API, más webhook y recibo | Sobre enviado y seguido desde la app (camino B) |
| 3 | Importar de SmartCredit por API y aviso a los 35 días | Ronda 2 armada sola |
| 4 (opcional) | Piloto automático con frenos, Stripe y WhatsApp/SMS | Camino C |

Quién hace cada fase: bugs y API → `full-stack-developer`; esquema, cifrado y RLS → `database-engineer`; pruebas con la base real → `qa-debugging`; portal → `ui-ux-designer`.

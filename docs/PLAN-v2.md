# CreditRep v2: plan de trabajo (13-nov-2026)

Fuente: el mensaje aprobado por Victor (cliente sube su PDF + Lob certificado) y el prototipo v2:
https://claude.ai/artifact/K1rFkC2vngWQkHMsFuamtU

Reglas:
- Rama nueva `v2-aprobacion-lob` y deploy de preview en Vercel. No se hace merge a `main` sin el OK de Victor.
- No se toca el lector de reportes (`src/lib/parser/*`) ni el login.
- Solo datos de ejemplo, marcados como tales. Ningún texto de la app promete borrados.

## Lo que ya comprobé en el código
| Lo que dice el mensaje | Comprobado | Dónde |
|---|---|---|
| El SSN está en texto plano | Sí | `supabase/schema.sql:64` |
| `{{cliente_ssn}}` puede imprimir el SSN completo | Sí (líneas 11 y 63, no 13 y 65) | `src/lib/letters.js` |
| El registro público está abierto | Sí | `schema.sql:44`, `api/register.js`, `App.jsx:54`, `Login.jsx:41` |
| La ronda 1 usa una razón genérica | Sí | `schema.sql:346`, `constants.js:70` |
| Un mismo buró puede salir en varios sobres | Sí | `PrintLetters.jsx:68-73` |
| No hay fecha límite ni flujo CFPB | Sí, no existen | — |
| El lector ya reconoce AnnualCreditReport | Detecta el origen (`parse.js:613`). Falta probarlo con un PDF real | — |

## Orden de trabajo
| # | Paso | Archivos | Termina cuando |
|---|---|---|---|
| 0 | Arreglar los bugs que rompen lo básico: el `_g` en el update, el cobro automático al importar, el cobro de cuentas positivas y que la ronda suba al generar | `ItemsTable.jsx`, `ItemForm.jsx`, `reportDiff.js`, `importReport.js`, `ImportReport.jsx`, `PackageBuilder.jsx`, `LetterWizard.jsx` | Las pruebas nuevas pasan |
| 1 | **Seguridad.** Cifrar el SSN (pgcrypto, llave solo en el servidor). Quitar `{{cliente_ssn}}` y el adjunto «tarjeta SSN». Cerrar `/registro`. Las listas no traen el SSN. Ocultar al cliente las columnas internas | `migration_003_seguridad.sql`, `letters.js`, `templateImport.js`, `Templates.jsx`, `ImportTemplates.jsx`, `App.jsx`, `Login.jsx`, `Register.jsx` (se borra), `api/register.js` (se borra), `Clients.jsx`, `ClientDetail.jsx`, `Portal.jsx` | Ninguna carta ni pantalla muestra el SSN completo |
| 2 | **Contrato CROA + autorización FCRA.** Firma en el portal, 3 días hábiles para cancelar, aviso de no garantía. Sin firma no se puede aprobar nada | `migration_004_contratos.sql` (`cr_consents`), `Portal.jsx`, componente nuevo `ConsentStep.jsx` | El envío queda bloqueado sin firma |
| 3 | **Comparador de 3 burós y razones por campo.** Comparar la misma colección en TU/EX/EQ y sacar `balance_incorrecto`, `fecha_incorrecta`, `cuenta_duplicada`, etc. Imprimirlas en `{{lista_items}}` | `src/lib/compareBureaus.js` (nuevo, con prueba), `letters.js`, `constants.js`, `ClientDetail.jsx` (pestaña «Reporte leído») | La prueba con 3 colecciones da los errores esperados |
| 4 | **Cartas: una por buró y por ronda.** Agrupar sobres por clave (no por orden). Fecha límite por carta. Reglas de adjuntos: R1/perfil = ID+bill, R2 = ID, inquiries = ID, validación/goodwill = nada. Ronda 2 pide los documentos usados. Ronda 3 sin amenaza de CFPB, más una guía CFPB aparte | `packageBuilder.js`, `PrintLetters.jsx`, plantillas en `migration_005_plantillas.sql`, `cr_letters` + `due_date` | El paquete de ejemplo da 3 cartas a burós + 3 de validación |
| 5 | **Revisar y aprobar cartas.** Página nueva con vista previa, Aprobar/Rechazar/Editar por carta y estados Pendiente/Aprobada/Rechazada/Enviada | `src/pages/admin/Approve.jsx` (nuevo), `AdminLayout.jsx`, `App.jsx`, `cr_letters.approval_status` | Nada se puede enviar sin aprobar |
| 6 | **API / Integraciones + Lob.** Pestaña con Lob, PostGrid y Click2Mail. La llave va a una función del servidor y se guarda en el Vault de Supabase. El envío usa Certified Mail con recibo electrónico. Un webhook guarda el estado y el recibo | `src/pages/admin/Integrations.jsx`, `api/integrations.js`, `api/lob-send.js`, `api/lob-webhook.js`, `src/pages/admin/Mailings.jsx` («Sobres y tracking») | Sin API el botón dice «Conecta primero tu API de Lob». Con la llave `test_` se envía en modo prueba |
| 7 | **Portal «Mi progreso».** Cada buró con sus 3 colecciones y sus datos de perfil, con el estado Enviada / En revisión / Borrada / No borrada. Sin conteo de sobres ni aprobación. Botón de AnnualCreditReport.com | `Portal.jsx`, componente nuevo `BureauProgress.jsx` (lo usan el portal y el admin) | El cliente de ejemplo ve 9 disputas y 7 datos de perfil |
| 8 | **Prueba obligatoria.** Cliente de ejemplo con 3 colecciones, 3 alias, 2 direcciones y 2 teléfonos | `tests/v2.test.mjs`, más una prueba en el preview con Supabase real | Pasan las 4 comprobaciones del mensaje |

## Decisiones que necesitan a Victor
1. **SSN en la carta:** últimos 4, como pide el mensaje. Riesgo: un buró puede responder «no pudimos identificarlo». Si pasa, se reenvía con la licencia; nunca con el SSN completo.
2. **Lob:** hay que abrir la cuenta y ver el precio del certificado y el límite de hojas por sobre. Al principio se usa la llave `test_`.
3. **Cobradores:** las 3 cartas de validación también pasan por la aprobación y por Lob (3 sobres más por ronda).
4. **Tiempos:** se esperan 30 días desde la **entrega** (recibo de Lob), no desde el envío.

# Crédito Pro — Cómo ponerlo en línea (15 minutos)

## 1. Supabase (tu otra cuenta)
1. Entra a supabase.com → **New project** (anota la contraseña de la base de datos).
2. Menú izquierdo → **SQL Editor** → **New query** → pega TODO el archivo `supabase/schema.sql` → **Run**.
   Crea las tablas, la seguridad, las plantillas de cartas y el almacenamiento privado de fotos (`cr-files`).
3. **Project Settings → API** (o *API Keys*) y copia 3 cosas:
   - Project URL → `https://xxxx.supabase.co`
   - **anon / publishable** key
   - **service_role / secret** key (¡esta es secreta, solo va en Vercel!)

## 2. GitHub + Vercel
1. Sube esta carpeta a un repositorio nuevo en GitHub (como siempre).
2. En vercel.com → **Add New → Project** → escoge el repositorio. Vercel detecta **Vite** solo.
3. Antes de *Deploy*, en **Environment Variables** agrega:

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |

4. **Deploy**.

## 3. Primer uso
1. Abre `https://TU-APP.vercel.app/setup` y crea tu cuenta de administrador (solo funciona una vez).
2. Ve a **Configuración**: nombre de tu empresa, **precio por cada eliminación** (colección, charge-off, etc.) y revisa las direcciones de los bureaus.
3. Comparte con tus clientes nuevos: `https://TU-APP.vercel.app/registro`

## Cómo funciona
- **Nuevo cliente** (tú): se crea su usuario y contraseña automáticamente; copias el mensaje y se lo mandas por WhatsApp.
- **Registro del cliente** (él): crea su cuenta en `/registro`, llena su información y toma foto de su licencia y bill. Te aparece como "Nuevo" en Clientes y en el Panel.
- **Subir reporte**: en la ficha del cliente → *Subir reporte* → PDF o página guardada (Ctrl+S) de IdentityIQ, SmartCredit, MyScoreIQ o MyFreeScoreNow. La app detecta nombres, alias, direcciones, teléfonos, empleadores, scores, cuentas (colecciones, charge-offs, pagos tarde…) e inquiries, **una fila por bureau**. Revisas y guardas.
- **Reporte siguiente**: la app compara con lo guardado. Lo que ya no aparece se marca **ELIMINADO** y se crea el **cobro** automáticamente (Eliminadas y cobros). Si algo vuelve a aparecer, te avisa como **Reinsertado**.
- **Cartas**: selecciona items → *Generar cartas* → escoge plantilla → se crea una carta por bureau (o por acreedor), lista para imprimir con copia de licencia y bill. Las plantillas se editan en *Plantillas*.
- Todo se puede **editar y borrar**: clientes, cuentas, inquiries, info personal, reportes, cartas, cobros, documentos y plantillas.

## Notas
- Si un reporte no se lee bien, usa la opción *Pegar texto* o agrega/edita los items a mano. Mándame un reporte de ejemplo (con datos tapados) y ajusto el lector a ese formato exacto.
- Los usuarios de los clientes entran solo con **usuario + contraseña** (sin email).
- Pruebas del lector: `npm install` y luego `npm test`.

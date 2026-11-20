# Piano Manager

Aplicación privada para un profesor de piano. `public/` contiene la interfaz responsive; `functions/api/[[path]].js` ejecuta SQL parametrizado en Cloudflare Pages Functions + D1. El navegador solo llama a `/api/`. `schema.sql` describe el esquema actual (académico, ingresos y autenticación). Para bases anteriores aplica `migrations/001_income.sql` y `migrations/002_auth.sql`. No hay datos de ejemplo que cargar.

## Autenticación propia

La app tiene su propio login con usuario/correo y contraseña. Cloudflare Access puede seguir actuando como **capa externa** en el edge; no hace falta cambiar su política para usar el login interno.

- No existe registro público. La única forma de crear cuentas es:
  - `npm run user:create` (D1 local) o `npm run user:create:remote` (D1 remota, solo cuando estés autorizado).
  - La pantalla **Usuarios** del administrador.
- Roles preparados: `owner` y `admin` (administradores), `profesor`, `monitor`. Los administradores pueden crear/editar usuarios, cambiar tarifas y usar respaldo. Los demás roles trabajan con el resto de módulos.
- Contraseñas: PBKDF2-SHA256 con sal aleatoria, guardadas solo como hash. Nunca se envían ni se guardan en `localStorage`.
- Sesiones: tokens aleatorios de 256 bits; en D1 se guarda únicamente `sha256(token)` con prefijo `r:` (persistente) o `s:` (de navegador).
  - `pm_session`: `HttpOnly`, `SameSite=Lax` y `Secure` cuando la petición es HTTPS.
  - `pm_remember`: `HttpOnly`, guarda solo el correo para precargarlo; nunca la contraseña.
  - **Mantener mi sesión iniciada** crea una cookie con `Max-Age` de 30 días y renueva/rota el token automáticamente. Sin esa opción la sesión caduca al cerrar el navegador o a las 12 horas.
  - **Cerrar sesión** borra la fila de sesión en D1 y expira la cookie; un token anterior deja de funcionar.
  - Límite de 5 intentos fallidos por IP+usuario con bloqueo de 15 minutos.
- Todas las rutas `/api/*` excepto `/api/health` exigen sesión válida. `/api/health` solo devuelve `{ok:true,database:"piano_manager_db"}` para monitoreo.

### Primer administrador

En local, el generador de pruebas crea el administrador automáticamente mediante `POST /api/auth/bootstrap`, disponible **solo** con `LOCAL_DEV=1` y cuando la tabla `users` está vacía. Para uso real:

```powershell
# Base local
npm run user:create

# D1 remota: ejecutar SOLO con autorización explícita y wrangler autenticado
npm run user:create:remote
```

El script pide correo, nombre, rol y contraseña dos veces (sin eco) y escribe el hash directamente en D1. Para automatización autorizada también acepta `PM_USER_EMAIL`, `PM_USER_NAME`, `PM_USER_ROLE` y `PM_USER_PASSWORD` como variables de entorno de un solo uso; no las guardes en archivos ni en la configuración de Pages.

### Recuperación de contraseña

El flujo está implementado con tokens de un solo uso, guardados como hash y con vencimiento de 60 minutos. Para habilitarlo configura estos **secrets** de Pages (nunca los pongas en `wrangler.toml` ni en el repositorio):

```powershell
npx wrangler pages secret put RESEND_API_KEY --project-name piano-class-manager
npx wrangler pages secret put RESET_FROM_EMAIL --project-name piano-class-manager
npx wrangler pages secret put APP_BASE_URL --project-name piano-class-manager
```

- `RESEND_API_KEY`: clave de API de <https://resend.com>.
- `RESET_FROM_EMAIL`: remitente verificado en Resend.
- `APP_BASE_URL`: URL pública de la app, por ejemplo `https://piano-class-manager.pages.dev`.

Opcional: `AUTH_PBKDF2_ITERATIONS` (10 000–100 000; por defecto 100 000, límite de Cloudflare Workers).

Sin esos secrets, `/api/auth/forgot` responde `503` con un mensaje explicativo y no envía correo. No se inventan credenciales de correo.

## Migración segura de autenticación

`migrations/002_auth.sql` es **aditiva**: crea `login_attempts`, `password_resets` y `record_owners`, y registra la versión en `schema_migrations`. No hace `ALTER`, `DROP`, `DELETE` ni reinicia la base. Las tablas `users` y `sessions` ya existían y se reutilizan.

Antes de tocar D1 remota, haz una copia. La migración remota **no** se ejecuta automáticamente:

```powershell
npx wrangler d1 export piano-manager-db --remote --output=./respaldo-antes-auth.sql
npm run db:migrate:remote
npx wrangler d1 execute piano-manager-db --remote --command "SELECT version FROM schema_migrations"
```

`record_owners` deja preparado el aislamiento por propietario para futuros espacios multiusuario. En la instalación actual (un solo estudio) los datos académicos son compartidos por los roles autorizados; las acciones sensibles ya están restringidas por rol.

## Publicar la actualización

1. **Conserva Cloudflare Access.** En Zero Trust → Access → Applications mantén la aplicación self-hosted y su política sobre `piano-class-manager.pages.dev`, `/api/*`, `*.piano-class-manager.pages.dev` y dominios personalizados. No cambies dominio, AUD ni políticas sin autorización.
2. En una ventana privada comprueba que producción y los despliegues antiguos siguen pidiendo acceso. Publicar una versión nueva no retira los despliegues anteriores.
3. Mantén en `[vars]` de `wrangler.toml` los identificadores públicos `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD`. Nunca configures `LOCAL_DEV` en Pages. Los secrets de correo no van en `[vars]`.
4. Conserva el binding D1: `binding = "piano_manager_db"`, `database_name = "piano-manager-db"` y el `database_id` existente. Desde la raíz:

   ```powershell
   npm ci
   npm test
   npx wrangler whoami
   ```

   La prueba usa Chrome, una D1 temporal y crea su propio administrador local; no toca la base remota.
5. Si la D1 remota aún no tiene `001_income`, aplícala primero tras copia. Si ya la tiene (caso actual), aplica solo `002_auth` como se indica arriba, **una sola vez**.
6. Crea el primer administrador real con `npm run user:create:remote` cuando el usuario lo autorice.
7. Configura los secrets de recuperación si quieres usar **Olvidé mi contraseña**.
8. Comprueba la rama de producción del proyecto Pages. **Solo cuando decidas publicar**:

   ```powershell
   npm run deploy -- --project-name piano-class-manager --branch RAMA_DE_PRODUCCION
   ```

   El comando sube estáticos y Pages Functions juntos. No vuelvas a crear la base ni ejecutes `db:init:remote`.
9. Entra por `https://piano-class-manager.pages.dev`: primero pasas Access y después el login de la app. Verifica `/api/me` (muestra tu usuario) y `/api/health`. Sin sesión propia, reportes, respaldos y CRUD deben responder `401`.

## Trabajo local

```powershell
npm run db:init     # base nueva
npm run db:migrate  # solo si ya existía una base local anterior
npm run dev
```

Abre la dirección local indicada por Wrangler. Para repetir la auditoría funcional: `npm test` (`tests/run.mjs` y `tests/daily-work.mjs`). La batería comprueba login, usuario recordado, sesión persistente, logout con revocación, bloqueo por intentos, rutas y API protegidas, roles, ausencia de registro público, responsive en escritorio/tablet/móvil, CRUD académico, ingresos y persistencia.

## Diseño responsive

- **Escritorio:** menú lateral fijo, tablas completas, panel y calendarios amplios.
- **Tablet/móvil:** menú lateral deslizable con overlay, botones táctiles de al menos 44 px, formularios de una columna, campos con fuente de 16 px (evita zoom automático en iOS), tablas convertidas en tarjetas con etiquetas, calendario compacto, modales como hoja inferior y sin scroll horizontal.
- Todas las vistas, incluidas Usuarios y Mi perfil, usan los mismos patrones.

## Uso diario

- En **Mi perfil** cambia tu contraseña; al hacerlo se cierran todas tus sesiones abiertas.
- El administrador usa **Usuarios** para dar de alta a profesores o monitores; el resto no ve ese enlace.
- En **Programa académico** crea niveles, unidades y temas; en **Estudiantes** registra los participantes.
- En **Planificación** programa una fecha o repetición semanal. Puedes registrar la clase desde el calendario, el panel o **Clases**.
- El **paso de lista** está dentro de la clase: selecciona participantes y marca presente, ausente o justificada antes de guardar.
- Al seleccionar participantes aparecen sus tareas pendientes anteriores. Desde **Tareas** puedes revisar, completar o asignar más.
- **Reportes** cuenta únicamente clases impartidas. Una grupal cuenta una sola vez; “asistencias registradas” cuenta marcas individuales, incluidas las ausencias. Imprime/PDF, CSV y XLSX.
- **Historial** consulta clases, listas, tareas y contenido (máximo 500 filas por filtro en clases y tareas).
- **Ingresos** calcula automáticamente el importe de cada clase impartida: Particular RD$600 y Grupal RD$800; A domicilio y Online aparecen sin tarifa hasta configurarlas en **Tarifas**. El importe queda congelado por clase.
- **Historial de ingresos** y **Reportes de ingresos** filtran por fecha, mes, año, modalidad y estudiante, con exportación PDF/XLSX/CSV.
- **Respaldo** exporta las diez tablas académicas/de ingresos en JSON; su importador solo incorpora estudiantes, ignora duplicados y requiere niveles existentes. Para una copia SQL completa usa `npx wrangler d1 export piano-manager-db --remote --output=./piano-manager.sql` y guarda el archivo fuera de `public/`.

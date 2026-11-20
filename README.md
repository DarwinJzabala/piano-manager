# Piano Manager

Aplicación para un profesor de piano. `public/` contiene la interfaz; `functions/api/[[path]].js` ejecuta SQL parametrizado en D1. El navegador solo llama a `/api/`. `schema.sql` describe el esquema actual, incluido el módulo de ingresos. Para una base anterior usa `migrations/001_income.sql` (`npm run db:migrate`). No hay datos de ejemplo que cargar.

## Publicar la actualización

1. **Protege primero los despliegues existentes.** En Cloudflare Zero Trust → Access → Applications, crea una aplicación self-hosted con política **Allow → Emails → tu correo**, y activa un método de inicio de sesión, por ejemplo One-time PIN. Cubre todo `piano-class-manager.pages.dev`, incluidas las rutas `/api/*`, y `*.piano-class-manager.pages.dev` para los alias y URLs por hash. Incluye cualquier dominio personalizado que uses. Configura los hostnames en la misma aplicación para compartir AUD. Si usas la protección de previews de Pages, comprueba el AUD de esa aplicación antes de usarla como entorno autorizado.
2. En una ventana privada comprueba que tanto la URL de producción como `929666cd.piano-class-manager.pages.dev/api/reports/monthly` exigen iniciar sesión. Publicar otra versión no retira automáticamente los despliegues antiguos.
3. En `[vars]` de `wrangler.toml` completa `ACCESS_TEAM_DOMAIN` (por ejemplo `tu-equipo.cloudflareaccess.com`, sin `https://`) y `ACCESS_AUD` (Application Audience de la aplicación Access). Son identificadores, no contraseñas. Nunca configures `LOCAL_DEV` en Pages. La API comprueba firma, emisor, audiencia y vencimiento del JWT antes de consultar D1. Sin configuración válida deniega el acceso.
4. Conserva la entrada D1: `binding = "piano_manager_db"`, `database_name = "piano-manager-db"` y el `database_id` existente. Desde la raíz del proyecto:

   ```powershell
   npm ci
   npm test
   npx wrangler whoami
   ```

   La prueba necesita Google Chrome instalado. Usa una base temporal y la elimina al terminar. Si `whoami` no muestra tu cuenta, ejecuta `npx wrangler login`.
   Si la D1 remota todavía no tiene el módulo de ingresos, haz primero una copia y aplica la migración **una sola vez**:

   ```powershell
   npx wrangler d1 export piano-manager-db --remote --output=./piano-manager-antes-ingresos.sql
   npx wrangler d1 execute piano-manager-db --remote --file=./migrations/001_income.sql
   ```

   La migración copia las filas existentes al ampliar las modalidades; no elimina datos ni reinicia la base. Verifica con `npx wrangler d1 execute piano-manager-db --remote --command "SELECT version FROM schema_migrations"`.
5. En Pages comprueba la rama de producción del proyecto. **Solo cuando decidas publicar**, sustituye `RAMA_DE_PRODUCCION` por ese nombre:

   ```powershell
   npm run deploy -- --project-name piano-class-manager --branch RAMA_DE_PRODUCCION
   ```

   No vuelvas a crear la base ni ejecutes `db:init:remote`. El comando despliega tanto los archivos estáticos como las Pages Functions.
6. Entra por `https://piano-class-manager.pages.dev`, inicia sesión y abre `/api/me` y `/api/health`. Deben aparecer tu correo y `{"ok":true,"database":"piano_manager_db"}` respectivamente. Un 403 tras iniciar sesión indica que debes revisar dominio de equipo, AUD y política; si falla salud, revisa el binding y esquema del entorno desplegado. Sin sesión no se deben poder consultar los reportes ni descargar respaldos.
7. Como comprobación final en producción, guarda tu primer registro real y vuelve a abrir la aplicación. El CRUD automatizado se prueba **en local**; la auditoría remota fue solo de lectura.

## Trabajo local

```powershell
npm run db:init     # base nueva
npm run db:migrate  # solo si ya existía una base local anterior
npm run dev
```

Abre la dirección local indicada por Wrangler. Para repetir la auditoría funcional: `npm test` (`tests/run.mjs` y `tests/daily-work.mjs`).

## Uso diario

- En **Programa académico** crea niveles, unidades y temas; en **Estudiantes** registra los participantes.
- En **Planificación** programa una fecha o una repetición semanal. Puedes registrar la clase desde el calendario, el panel o **Clases**.
- **Paso de lista** está dentro de la clase: selecciona participantes y marca presente, ausente o ausencia justificada antes de guardar.
- Al seleccionar participantes aparecen sus tareas pendientes anteriores, incluso si cambió el día de clase. Desde **Tareas** puedes revisar, completar o asignar más tareas por estudiante.
- **Reportes** cuenta únicamente clases impartidas. Una grupal cuenta una sola vez; “asistencias registradas” cuenta marcas individuales, incluidas las ausencias. Se puede imprimir/guardar como PDF, descargar CSV y exportar XLSX si está disponible SheetJS.
- **Historial** consulta clases, listas, tareas y contenido. Las consultas de clases y tareas del historial muestran como máximo 500 registros por filtro.
- **Ingresos** calcula automáticamente el importe de cada clase al marcarla como impartida: Particular RD$600 y Grupal RD$800; A domicilio y Online aparecen sin tarifa hasta que las configures en **Tarifas**. Solo se contabiliza cada clase una vez, se descuenta si cambia a cancelada/reprogramada y se elimina si se borra la clase. El importe queda congelado: cambiar una tarifa no altera ingresos anteriores.
- **Historial de ingresos** muestra fecha, hora, estudiante/grupo, modalidad, estado, tarifa e importe, con filtros por fecha, mes, año, modalidad y estudiante.
- **Reportes de ingresos** genera totales y desglose por modalidad para día, semana, mes, año, modalidad o período personalizado; exporta PDF, XLSX y CSV.
- **Respaldo** exporta las diez tablas (las ocho académicas más `modalities` e `income_entries`) en JSON; su importador solo incorpora estudiantes, ignora duplicados y requiere que los niveles referenciados existan. Para una copia SQL recuperable del conjunto de la D1 usa `npx wrangler d1 export piano-manager-db --remote --output=./piano-manager.sql`. Guarda esa copia fuera de `public/`.

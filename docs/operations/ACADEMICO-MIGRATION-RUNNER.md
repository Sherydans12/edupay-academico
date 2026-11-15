# Ejecutar el runner de migración de Académico (one-shot)

Este procedimiento cubre una migración Prisma aditiva de Académico con el runner
publicado en GHCR, ejecutado **una vez** en el servidor Coolify. No autoriza por
sí mismo una migración: cada ejecución requiere autorización específica, el
[gate de destino](RUNBOOK.md#gate-del-destino-postgresql-antes-de-mantenimiento)
y un recovery point nuevo. Antes de cambios destructivos, de datos o de varias
migraciones, revisa [DIE-MAINTENANCE.md](DIE-MAINTENANCE.md), que define la
ventana con mantenimiento completo.

## Reglas

- Usa solo la referencia inmutable `ghcr.io/sherydans12/edupay-academico-migrate@sha256:<digest>`
  publicada por **Actions → Publish academico migration runner** desde `main`.
  El digest está en el log del paso _Verify published digest, labels, and
  provenance_ (`MIGRATION_IMAGE=`), no en el Summary ni en el `.dockerbuild`.
- El secreto `DATABASE_URL` se toma del contenedor del API activo y se entrega
  al runner en un archivo de entorno con permisos `600`. Nunca se imprime, no
  va en argumentos, historial, logs, capturas ni tickets.
- El runner corre con `--rm`, sin política de reinicio, sin puertos y en la red
  Docker que comparte con la base. No crees un recurso Coolify permanente para
  él: una aplicación Coolify se reinicia al terminar y repetiría el comando.
- No uses `migrate resolve`, SQL manual ni `RUN_MIGRATIONS` del API para
  convertir un gate fallido en verde.
- Si el host no puede descargar la imagen privada, detente. No pegues tokens en
  la terminal; resuelve el acceso del registro como cambio aparte.

## 1. Ensayo local (sin producción)

Desde la raíz de un checkout de `main` con Docker disponible:

```powershell
docker pull ghcr.io/sherydans12/edupay-academico-migrate@sha256:<digest>
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-academic-migration-runner.ps1 `
  -AcademicImage ghcr.io/sherydans12/edupay-academico-migrate@sha256:<digest> `
  -ExpectedRevision <sha-completo-de-main> `
  -AppliedCount <filas-del-ledger-productivo>
```

El script usa solo PostgreSQL 15 desechable. Comprueba comando, plataforma y
revisión de la imagen; instalación desde cero con checksums exactos y una
segunda ejecución sin cambios; `migrate status` listando solo lo pendiente;
upgrade desde el ledger aplicado conservando filas sintéticas; y, para
ADR-0024, columnas, restricciones e índice sin backfill. Si falla, no abras la
ventana.

## 2. Preparación en el servidor (sin escrituras en la base)

En **Coolify → Terminal → localhost**, como root. Confirma antes en Coolify el
nombre y UUID de cada recurso; los valores de ejemplo son los del inventario.

```bash
API_UUID=iobfkpujjoa2kj5urbpnjvzi      # edupay-academico-pinned
DB_UUID=v5w9hacwtftulf4m46l1rn2g       # academico-db
RUNNER='ghcr.io/sherydans12/edupay-academico-migrate@sha256:<digest>'

API_CONTAINER=$(docker ps --filter "name=$API_UUID" --format '{{.Names}}')
DB_CONTAINER=$(docker ps --filter "name=$DB_UUID" --format '{{.Names}}')
echo "API=$API_CONTAINER DB=$DB_CONTAINER"
```

Debe aparecer exactamente un contenedor de cada uno. Si hay cero o más de uno,
detente.

Red compartida entre API y base:

```bash
comm -12 \
  <(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$API_CONTAINER" | sort) \
  <(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$DB_CONTAINER" | sort)
```

Debe listar una red (habitualmente `coolify`). Guárdala:

```bash
NET=<red-compartida>
```

Imagen del runner, desde el registro privado y con la revisión esperada:

```bash
docker pull "$RUNNER"
docker inspect "$RUNNER" --format '{{index .Config.Labels "org.opencontainers.image.revision"}} {{json .Config.Cmd}}'
```

Debe mostrar el SHA de `main` publicado y
`["pnpm","--filter","@edupay/api","db:migrate:deploy"]`.

Archivo de entorno con el secreto, sin mostrarlo:

```bash
umask 077
ENV_FILE=$(mktemp /root/academico-migrate.XXXXXX)
{ printf 'DATABASE_URL='; docker exec "$API_CONTAINER" printenv DATABASE_URL; } > "$ENV_FILE"
test "$(wc -l < "$ENV_FILE")" -eq 1 && stat -c '%a %n' "$ENV_FILE"
```

Debe mostrar `600` y la ruta. Comprueba que el runner apunta al destino del
gate, proyectando solo campos no secretos:

```bash
docker run --rm --network "$NET" --env-file "$ENV_FILE" --entrypoint node "$RUNNER" \
  -e 'const u=new URL(process.env.DATABASE_URL); console.log(JSON.stringify({host:u.hostname,port:u.port||"5432",database:decodeURIComponent(u.pathname.slice(1)),schema:u.searchParams.get("schema")}))'
```

Debe coincidir con el gate de destino (host = UUID de la base, base y esquema
verificados). Si no coincide, borra el archivo (`shred -u "$ENV_FILE"`) y
detente.

## 3. Ventana

1. **Pausar escritores.** En Coolify, detén el recurso API (`edupay-academico-pinned`).
   Confirma que los workers de notificación y sync siguen detenidos. El FRONT
   puede quedar arriba: mostrará errores de carga durante la ventana.
2. **Recovery point.** Ejecuta una sola vez el launcher protegido documentado en
   [RUNBOOK.md](RUNBOOK.md#backups-y-cambios-de-esquema) y verifica integridad
   local, presencia en R2 y que el manifiesto registre el ledger actual. Si
   falla, vuelve a levantar el API sin migrar.
3. **Estado previo.** Lista lo pendiente; con migraciones pendientes Prisma
   termina con código 1, lo cual es esperado aquí:

   ```bash
   docker run --rm --network "$NET" --env-file "$ENV_FILE" "$RUNNER" \
     pnpm --filter @edupay/api db:migrate:status
   ```

   Debe listar **solo** las migraciones autorizadas del corte. Cualquier otra
   pendiente, migración fallida o diferencia de historia obliga a detenerse.

4. **Aplicar una vez.**

   ```bash
   docker run --rm --network "$NET" --env-file "$ENV_FILE" "$RUNNER"
   echo "exit=$?"
   ```

   Debe mostrar `Applying migration` solo para lo autorizado, `All migrations
have been successfully applied.` y `exit=0`. No repitas el comando ante un
   error: registra la salida (sin secretos) y detente.

5. **Eliminar el secreto.**

   ```bash
   shred -u "$ENV_FILE"; unset ENV_FILE
   ```

6. **Verificar** en la terminal del recurso de base, en modo solo lectura:

   ```bash
   PGOPTIONS='-c default_transaction_read_only=on' psql -U "$POSTGRES_USER" -d <base> -At -c "select count(*) filter (where finished_at is not null and rolled_back_at is null)||'|'||count(*) from _prisma_migrations; select migration_name from _prisma_migrations order by started_at desc limit 1; select count(*) from students; select count(*) from course_enrollments;"
   ```

   Ledger con la nueva cantidad esperada, la última migración autorizada y
   conteos iguales a los del gate. Si cambian los conteos, no levantes el API
   nuevo y restaura según el RUNBOOK.

7. **API y FRONT.** Cambia el API al digest publicado desde el mismo `main`,
   redeploya y verifica `/api/v1/health/live` y `/api/v1/health/ready`. Luego
   redeploya el FRONT según [ACADEMICO-WEB-REDEPLOY.md](ACADEMICO-WEB-REDEPLOY.md).

Rollback: una migración aditiva es compatible con el API anterior; si el API
nuevo falla, vuelve a su digest previo. Revertir el esquema requiere restaurar
el recovery point con autorización específica.

## Corte ADR-0024 (RUN/IPE) — preparado 2026-11-15

| Dato                | Valor                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fuente              | `main` `3a06df42783e470262bfa8179149b0a12d5a2d12`                                                                                                |
| Runner              | `ghcr.io/sherydans12/edupay-academico-migrate@sha256:1712e056574a92269c72cd5df3ce7cda2ae020c44d79f1d0c3769b7e7e74f4d6` (run 43731466508)         |
| API                 | `ghcr.io/sherydans12/edupay-academico@sha256:c988b07a80a5e43363472045d06c795bbe329514b7d1ca9272152d5f49b7a4f8` (run 43731449591)                 |
| FRONT               | `ghcr.io/sherydans12/edupay-academico-web@sha256:bea5d1bb1b92483d509b9176e5c2068484f5f2a7f95ad51ef95de231963d1094` (tag `main`, run 43679997369) |
| Migración pendiente | `20261115120000_student_national_identifier`, SHA-256 `078b8b251f4f386201c409b5d611f8ae4bb9c2b58980613b9517893d521dab39`                         |

**Gate de destino observado (solo lectura, 2026-11-15):** el API apunta al host
`v5w9hacwtftulf4m46l1rn2g`, puerto 5432, base `postgres`, sin parámetro
`schema` (Prisma usa `public`). En `academico-db`: `current_database()` =
`postgres`, `current_schema()` = `public`, ledger 13/13 terminado sin
rollbacks, última `20260924120000_die_staff_members`, los 13 checksums iguales
a los `migration.sql` de `main`; `students` = 253 y `course_enrollments` = 242.

**Ensayo local:** `scripts/verify-academic-migration-runner.ps1` con el runner de
la tabla, `-AppliedCount 13`: imagen verificada, instalación desde cero con 14
checksums y rerun sin cambios, `migrate status` solo con la migración pendiente,
upgrade 13 → 14 con conteos sintéticos conservados, estructura RUN/IPE correcta
y sin backfill. Una prueba con un secreto sintético confirmó que la salida del
runner no imprime la contraseña del `DATABASE_URL`.

**Esperado tras aplicar:** ledger 14/14, última
`20261115120000_student_national_identifier`, `students` = 253 y
`course_enrollments` = 242 (si cambiaron por uso normal entre el gate y la
ventana, compara con el conteo tomado al pausar el API). El `CREATE UNIQUE
INDEX` no es `CONCURRENTLY`; con 253 filas el bloqueo esperado es breve y el
API está detenido durante la ventana.

Pendiente: recovery point, ejecución, verificación y redeploys no se han hecho.
Al completarlos, registra en [PRODUCTION.md](PRODUCTION.md) y en el inventario
lo observado (deployment, digests, ledger y health).

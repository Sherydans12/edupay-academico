# Traspaso de la autoridad EDUPAY a Académico (ADR-0026)

Procedimiento para ejecutar una vez, por tenant, el traspaso de
[ADR-0026](../decisions/ADR-0026-edupay-authority-transfer.md). Cada etapa con
escritura en producción requiere autorización específica. Este documento no
la concede.

Estado: **ejecutado el 2026-11-20** para el tenant del colegio (evidencia al final).

## Qué cambia

| Etapa                | Efecto                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Migración            | `20261120120000_edupay_authority_transfer` reemplaza solo la función del disparador de identidad `EDUPAY`. |
| Imagen del API       | Agrega el comando `dist/sync/edupay-authority-transfer-main.js` y los bloqueos del sync v1.                |
| Traspaso (`--apply`) | Deshabilita el sync v1 y pasa alumnos, cursos y matrículas `EDUPAY` a `MANUAL`, conservando la referencia. |

No cambia tablas, índices, cuotas ni pagos. Tampoco emite eventos de
proyección: el payload hacia Pagos no cambia.

## 1. Gate de solo lectura

En **Coolify → Terminal → localhost**, con `root@srv1524006` confirmado y los
UUID del [inventario](coolify-inventory.json):

- Ledger de Académico sin migraciones fallidas ni pendientes fuera de esta.
- Backups al día (`systemctl show edupay-backup.service -p Result`).
- Conteos `EDUPAY` del tenant, que deben coincidir con el ensayo del paso 4.
  Referencia del 2026-11-20: 252 alumnos (242 activos), 13 cursos y 242
  matrículas activas.
- Sin una ejecución del sync en curso: `sync_leases.locked_until` en el pasado.

## 2. Recovery point

Con `umask 077` en `/root/edupay-recovery/academico/<UTC>/`:

- `pg_dump -Fc` de la base de Académico desde su contenedor;
- `SHA256SUMS`;
- restauración en un PostgreSQL 15 desechable con `--network none`, comparando
  conteos de alumnos, cursos, matrículas, outbox y ledger con la base viva.

Sin restauración verificada no se continúa.

## 3. Migración

Con el runner publicado desde `main` y su digest, según
[ACADEMICO-MIGRATION-RUNNER.md](ACADEMICO-MIGRATION-RUNNER.md): ensayo local,
`migrate status` con esta única migración pendiente y luego la ejecución.

Verificación: el ledger registra la migración y
`pg_get_functiondef('prevent_edupay_external_identity_mutation'::regproc)`
contiene `edupay.authority_transfer`.

La migración es compatible con la imagen anterior, porque solo la nueva fija
esa variable de sesión.

## 4. Redeploy del API y ensayo

El operador hace el redeploy del API `edupay-academico-pinned` con el digest
nuevo, con **"Run Docker Cleanup" desmarcado**. Luego, dentro del contenedor
del API:

```bash
node dist/sync/edupay-authority-transfer-main.js --tenant-id <uuid-canónico>
```

Debe reportar `blockers: []`, `syncConfiguration: "ENABLED"` y los conteos
del gate. Un bloqueo detiene el procedimiento:

| Bloqueo                           | Significado                                             |
| --------------------------------- | ------------------------------------------------------- |
| `EDUPAY_TEACHERS_PRESENT`         | Hay profesores `EDUPAY`; el traspaso no los contempla.  |
| `EDUPAY_RECORD_WITHOUT_REFERENCE` | Una fila `EDUPAY` sin referencia; perdería su vínculo.  |
| `MANUAL_REFERENCE_COLLISION`      | Una fila `MANUAL` ya usa la referencia de una `EDUPAY`. |
| `SYNC_RUN_IN_PROGRESS`            | Una ejecución del sync tiene la concesión.              |

## 5. Aplicar

```bash
node dist/sync/edupay-authority-transfer-main.js --tenant-id <uuid-canónico> \
  --apply --expect-students <n> --expect-courses <n> --expect-enrollments <n>
```

Los tres valores salen del ensayo. Si el padrón cambió, responde
`TRANSFER_COUNTS_CHANGED` y no aplica nada. Repetirlo con los mismos valores
informa `transferred` en cero.

## 6. Verificación

- Cero filas `EDUPAY` en alumnos, cursos y matrículas del tenant. Las
  traspasadas, con `source = MANUAL` y la misma `external_reference`.
- `sync_configurations.enabled = false`.
- Sin eventos nuevos en `financial_projection_outbox_events` por el traspaso.
  En Pagos, sin cambios en consumidos, cuarentena, alumnos, cuotas ni pagos.
- En la web: Personas muestra "Traspasado desde EduPay"; el roster ya no marca
  "Gestionado por sincronización" y el avance anual incluye esas matrículas en
  la vista previa (solo vista previa, sin confirmar).

## Reversa

No hay comando inverso. Se vuelve atrás restaurando el recovery point del
paso 2, lo que descarta cualquier cambio posterior en Académico. Si después
ya hubo admisiones, avances o ediciones, no se restaura: se corrige hacia
adelante.

## Ejecución del 2026-11-20

Con autorización explícita del usuario para la ventana de migración y,
aparte, para el traspaso. Comandos desde **Coolify → Terminal → localhost**
(`root@srv1524006`). Las consultas de verificación fueron de solo lectura
(`default_transaction_read_only=on`). No se imprimió `DATABASE_URL`.

### Artefactos (fuente `main` `eebc058b953a03186f92d347bfba5ff786f46ecd`)

| Componente          | Artefacto                                                                                                              | Run         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------- |
| Académico API       | `ghcr.io/sherydans12/edupay-academico@sha256:aae578d508b0511b26a1520878b9f1e9056ebbdd3ea9d96a8e0a8d695171fb79`         | 44741727606 |
| Runner de migración | `ghcr.io/sherydans12/edupay-academico-migrate@sha256:3ae0d1f73badab53b9539d9f835572f0188f2e62b0dcb57930c03e9ecb3157ac` | 44741732938 |

Ensayo local del runner (`verify-academic-migration-runner.ps1 -AppliedCount 14`,
PostgreSQL 15 desechable): imagen y revisión correctas, instalación desde
cero con 15 checksums, `migrate status` con solo esta migración pendiente y
actualización 14 → 15 sin cambiar conteos.

Rollback del API: `sha256:7625ab2230936487e70070a6f7871958bc2e750a921cf9048480204e48c7b3b4`
(presente en el host).

### Ventana

| Hora UTC          | Paso                                    | Resultado                                                                                                     |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 13:20             | Gate                                    | `postgres`/`public` en `v5w9hacwtftulf4m46l1rn2g`, red `coolify`; ledger 14/14; concesión del sync libre      |
| 13:22             | Helper de backup                        | faltaba en el host (ver abajo); `docker pull` del digest exacto, sin tocar launcher ni timer                   |
| 13:24             | Archivo de entorno                      | `600`; el runner apunta a `v5w9hacwtftulf4m46l1rn2g:5432/postgres`, sin `schema`                               |
| 13:28:45          | API detenido (operador, sin Docker Cleanup) | ningún contenedor del recurso                                                                              |
| 13:29             | Estado previo                           | ledger 14; 255 alumnos, 15 cursos, 244 matrículas, outbox 3; 0 sesiones de cliente                            |
| 13:29:03–13:29:23 | Recovery point `20261120T132903Z`       | `edupay-backup.service` `success`; dumps de Académico e Identity y archivos privados; R2 verificado            |
| 13:29             | Restauración aislada                    | PostgreSQL 15 con `--network none`: `14 \| 255 \| 15 \| 244 \| 3 \| 252`, igual a la base viva; contenedor eliminado |
| 13:30:09          | `migrate status`                        | 15 encontradas; solo `20261120120000_edupay_authority_transfer` pendiente (código 1 esperado)                 |
| 13:30:35–13:30:37 | `migrate deploy` (una vez)              | aplicada; `exit=0`; archivo de entorno eliminado con `shred -u`                                               |
| 13:31             | Verificación                            | ledger 15/15, checksum `cb9c19c0…1142ba1f` igual a `main`; la función contiene la marca; 3 disparadores activos; conteos sin cambios |
| 13:32:20          | API al digest nuevo (operador)          | `healthy`; `/health/live` y `/health/ready` 200; sin errores en logs; publicador habilitado                    |

`SHA256SUMS` del recovery point: `academico.postgres.dump` `4380abeea0ce11af…`,
`academico-private-files.tar.gz` `1633977054f9671b…`, `identity.postgres.dump`
`939152442eae46a1…` (prefijos; el archivo completo queda en
`/var/lib/edupay-backup-staging/20261120T132903Z/` y en R2).

**Hallazgo:** `edupay-backup.service` falló en todas las ejecuciones desde el
2026-11-16 06:00 UTC hasta el 2026-11-20 12:00 UTC (18 seguidas; última
exitosa 2026-11-16 00:00 UTC) con
`Required immutable PostgreSQL-15 backup helper reference is unavailable`.
Misma causa que el 2026-11-15: el helper desapareció del host,
probablemente por "Run Docker Cleanup" en un redeploy del 2026-11-16.

### Traspaso

| Hora UTC          | Paso                                     | Resultado                                                                                     |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| 13:33:20          | Ensayo                                   | `toTransfer` 252/13/242; activos 242/242; `syncConfiguration` `ENABLED`; sin bloqueos          |
| 13:34:45          | Línea base de BL-002 (solo lectura)      | consumidos 3, cuarentena 0, alumnos 256, cursos 16, cuotas 2.723, pagos 2.228                  |
| 13:35:02–13:35:04 | `--apply` con 252/13/242                 | `transferred` 252/13/242; `syncConfiguration` `DISABLED`; correlación `6e8c040b-90d2-42ec-9102-baf8e43ce77d` |
| 13:35             | Académico (solo lectura)                 | 0 filas `EDUPAY`; 252/13/242 `MANUAL` con referencia; totales 255/15/244 sin cambios; sync deshabilitado; outbox sin eventos nuevos (3, último 12:23) |
| 13:35:31          | BL-002 (solo lectura)                    | igual a la línea base, incluidos montos de cuotas y pagos y la última actualización de alumnos |

No verificado en esta ventana: la etiqueta "Traspasado desde EduPay" en la web
(el FRONT sigue con la imagen anterior, que muestra "Registro manual" para
estas fichas) ni la vista previa del avance anual con sesión de administrador.


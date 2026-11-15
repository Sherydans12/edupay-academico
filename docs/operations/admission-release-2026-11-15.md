# Release de admisión RUN/IPE (ADR-0024) — 2026-11-15

Ventana ejecutada desde Coolify (UI y terminal root del servidor `localhost`)
con autorización explícita del usuario. Todos los comandos sobre la base fueron
de solo lectura salvo la migración autorizada. No se imprimió `DATABASE_URL`,
no se crearon fichas ni matrículas y no se usaron datos reales como prueba.

## Artefactos

| Componente          | Fuente                                            | Artefacto                                                                                                                                        | Recurso                                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Runner de migración | `main` `3a06df42783e470262bfa8179149b0a12d5a2d12` | `ghcr.io/sherydans12/edupay-academico-migrate@sha256:1712e056574a92269c72cd5df3ce7cda2ae020c44d79f1d0c3769b7e7e74f4d6` (run 43731466508)         | one-shot en el host                                            |
| Académico API       | `main` `3a06df42783e470262bfa8179149b0a12d5a2d12` | `ghcr.io/sherydans12/edupay-academico@sha256:c988b07a80a5e43363472045d06c795bbe329514b7d1ca9272152d5f49b7a4f8` (run 43731449591)                 | `edupay-academico-pinned` `iobfkpujjoa2kj5urbpnjvzi`           |
| Académico FRONT     | `main` `3a06df42783e470262bfa8179149b0a12d5a2d12` | `ghcr.io/sherydans12/edupay-academico-web@sha256:bea5d1bb1b92483d509b9176e5c2068484f5f2a7f95ad51ef95de231963d1094` (tag `main`, run 43679997369) | `edupay-academico-web-die-20260924` `cct0rtf5iku6fkd3t9hldnv4` |

Antes de la ventana el API activo corría
`ghcr.io/sherydans12/edupay-academico@sha256:5a6ae5e127797956c5718403fc58d83c28499e8ff7f2743f69751654f7da1056`
(fuente `3eca5e7`, contenedor arriba desde hacía 2 días). Ese digest es el
rollback del API; la migración aditiva es compatible con él.

## Gate de destino (solo lectura)

- API → host `v5w9hacwtftulf4m46l1rn2g`, puerto 5432, base `postgres`, sin
  parámetro `schema` (Prisma usa `public`). La proyección desde el runner con
  el archivo de entorno dio el mismo destino.
- `academico-db` (`v5w9hacwtftulf4m46l1rn2g`, PostgreSQL 15): `postgres`/`public`,
  ledger 13/13 terminado sin rollbacks, última
  `20260924120000_die_staff_members`, los 13 checksums iguales a `main`.
- Con el API detenido: `students` = 253, `course_enrollments` = 242, 0 sesiones
  activas en la base.

## Recovery point

Hallazgo previo: **los backups automáticos fallaban en todos los runs al menos
desde el 2026-11-14** (`edupay-backup.service` con `status=1/FAILURE` cada 6 h;
el journal no conserva ningún run exitoso). Causa:
`Required immutable PostgreSQL-15 backup helper reference is unavailable.` El
launcher exige localmente
`ghcr.io/sherydans12/edupay-pg15-backup-helper@sha256:78016dcfcec425b1649c23cc60fcca01abd4dc63e97f79d33425d339fde39b6f`,
que ya no estaba en el host; la causa probable es la opción **Run Docker
Cleanup** que Coolify marca por defecto al detener recursos.

Corrección: `docker pull` de ese digest exacto y verificación de su
`RepoDigest`. No se cambió el launcher, el timer ni su configuración.

Recovery point `20261115T162559Z` vía `systemctl start edupay-backup.service`
(16:25:58 UTC, `Result=success`): `academico.postgres.dump`,
`academico-private-files.tar.gz` e `identity.postgres.dump` OK; subida a R2 y
verificación remota correctas. `SHA256SUMS`:

| Archivo                          | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `academico.postgres.dump`        | `d7e0045e0df35cc0e174ecb0e1216dcfb04bb77df2ab2126810e2b30f47e9ed3` |
| `academico-private-files.tar.gz` | `1633977054f9671b97f1998321e9da4cae951c20ef0613e6e63724ecfd3ba20d` |
| `identity.postgres.dump`         | `44d7d09affeced7657281370ed8e801606df9f7068b883316e5ead4730fdf950` |

El manifiesto no registra el ledger; el estado 13/13 quedó verificado
inmediatamente antes con el API detenido.

## Ventana

| Hora UTC          | Paso                                                   | Resultado                                                                                                                   |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| antes de 16:25    | API detenido en Coolify, **sin** Run Docker Cleanup    | `Exited`; workers de notificación y sync ya detenidos; runner, helper y digest de rollback presentes                        |
| 16:25:58          | Recovery point                                         | `20261115T162559Z` OK, R2 verificado                                                                                        |
| ~16:26            | `migrate status` con el runner                         | 14 encontradas; solo `20261115120000_student_national_identifier` pendiente; código 1 esperado                              |
| 16:27:22–16:27:25 | `migrate deploy` (una vez, `--rm`)                     | `Applying migration 20261115120000_student_national_identifier`; `All migrations have been successfully applied.`; código 0 |
| 16:27             | Archivo de entorno                                     | `shred -u`; no queda ningún `/root/academico-migrate.*`                                                                     |
| ~16:28            | API a `c988b07…` y Deploy                              | contenedor `(healthy)`; `/api/v1/health/live` 200; `/api/v1/health/ready` 200; sin errores en logs                          |
| 16:30:19–16:30:56 | FRONT Redeploy (deployment `oly0dehqtbjv1s68ksopmywd`) | rolling update completo; contenedor `(healthy)` con RepoDigest `bea5d1bb…`; `/api/health` 200; `/login` 200                 |

## Verificación posterior (solo lectura)

- Ledger 14/14, última `20261115120000_student_national_identifier` con
  checksum `078b8b251f4f386201c409b5d611f8ae4bb9c2b58980613b9517893d521dab39`
  (igual a `main`).
- `students` = 253, `course_enrollments` = 242, 0 fichas con identificador.
- Columnas, CHECK e índice único: `2|2|1`.
- `POST /api/v1/student-admissions/lookup` y `GET /api/v1/students` sin sesión
  responden 401: la ruta nueva existe y está protegida.

## Pendiente

- Smoke funcional autenticado de «Incorporar alumno» con un tenant y datos
  sintéticos aprobados; no se hizo con datos reales.
- Los nuevos alumnos no aparecen en Pagos: la proyección Académico → Financiero
  sigue apagada (ADR-0024, punto 6).
- Revisar en Coolify la opción de Docker Cleanup por defecto y proteger el
  helper de backup y los digests de rollback frente a limpiezas.
- Identity, BL, workers, ClamAV, redes, dominios y flags no cambiaron.

# Traspaso de la autoridad EDUPAY a Académico (ADR-0026)

Procedimiento para ejecutar una vez, por tenant, el traspaso de
[ADR-0026](../decisions/ADR-0026-edupay-authority-transfer.md). Cada etapa con
escritura en producción requiere autorización específica. Este documento no
la concede.

Estado al 2026-11-20: **preparado, no ejecutado.**

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

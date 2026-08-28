# Dry-run operativo del release candidate

Estado del ejercicio: **documentado; no ejecutado contra producción**.

Base revisada: `c5b92d3308b92a5dfc6f60da9b111f47344b7765`.
La remediación se ejecuta en una rama/worktree separado. Este documento no
autoriza merge, push, deploy, acceso a producción ni migraciones productivas.

## Fuentes fijadas

| Dependencia           | Referencia fijada                                                                          | Evidencia/clasificación                       |
| --------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Académico             | `c5b92d3308b92a5dfc6f60da9b111f47344b7765`                                                 | RC solicitado                                 |
| EduPay Identity       | `98da17b013c9fbf74f618a2f54e0eea8779c5136`                                                 | checkout disposable limpio y revisado         |
| BL-002 EduPay         | `abc3776631d5940759d1a45ad949413174f2acf9`                                                 | SHA registrado en evidencia disposable previa |
| `actions/checkout`    | `11d5960a326750d5838078e36cf38b85af677262`                                                 | `v4`, pin de workflow                         |
| `pnpm/action-setup`   | `b906affcce14559ad1aafd4ab0e942779e9f58b1`                                                 | `v4`, pin de workflow                         |
| `actions/setup-node`  | `49933ea5288caeca8642d1e84afbd3f7d6820020`                                                 | `v4`, pin de workflow                         |
| ClamAV                | `clamav/clamav@sha256:75fb5fd95fcbe1d7e6d240c369c1572b686ee2c95949d1042b5148de8eddebb4`    | digest de `1.4.3`, disposable                 |
| PostgreSQL disposable | `postgres:15@sha256:926f8799aef36e00001cfe15fba7abbd37d3c5224ea57e4c858e4bb670f10561`      | digest verificado                             |
| Node base images      | `node:22-bookworm@sha256:8a34c4ab3ea2c5cd194f07e317b2a8f09461d3c8b05c4e34c8ccd56d56024c4d` | digest verificado                             |

El workflow ya no usa `ref: main` para Identity/BL-002 ni tags flotantes para
las acciones del gate. El smoke requiere `PILOT_IDENTITY_SHA` y
`PILOT_EDUPAY_SOURCE_SHA`; un checkout sin esos pins aborta antes de iniciar
servicios.

## Orden exacto propuesto para una ejecución autorizada

1. Confirmar autorización explícita de Owner y Operaciones; verificar que todos
   los endpoints sean de producción previstos, HTTPS, issuer/audience/JWKS
   coincidan y los secretos provengan del gestor documentado. No imprimirlos.
2. Congelar el artefacto y dependencias en los SHAs anteriores. Verificar
   `git status` limpio, SHA esperado, imagen/digest esperado y ausencia de
   cambios locales.
3. Ejecutar backup de Identity, Académico y storage privado; generar
   `SHA256SUMS`, transferir al R2 no productivo aprobado y verificar existencia,
   tamaño y SHA remoto. Este paso quedó validado en el ejercicio disposable de
   `20260828T150741Z`; cualquier otro destino debe volver a validarse.
4. Ejecutar un restore disposable separado y verificar ambos dumps, archivos,
   tenant canónico, tamaños y SHA-256. No restaurar en bases productivas.
5. Desplegar Identity en el SHA fijado. Aplicar solo sus migraciones aditivas
   en la base autorizada, comprobar liveness, issuer, audience, JWKS y tokens
   de servicio antes de continuar.
6. Preparar la base Académico y ejecutar únicamente la cadena de migraciones
   revisada, en orden lexicográfico por directorio. Las dos migraciones del RC
   son aditivas y no contienen `DROP` ni `TRUNCATE`. La migración histórica
   `20260811190000_edupay_sync_consumer` reemplaza un índice con `DROP INDEX`
   pero no elimina filas; requiere aprobación explícita del responsable DB y
   no puede confundirse con un rollback destructivo. Ante cualquier `DROP`
   adicional, `TRUNCATE`, reset o pérdida de datos, abortar.
7. Iniciar el API Académico después del éxito de migración. Verificar
   `/api/v1/health/live` y `/api/v1/health/ready`, conexión a PostgreSQL,
   storage privado y ClamAV privado saludable.
8. Iniciar workers solo después de readiness del API; verificar sus comandos
   `--check`, leases, logs y ausencia de secretos. Iniciar web después de API e
   Identity saludables.
9. Ejecutar smoke posterior: login/refresh/logout, issuer/audience/JWKS,
   tenant isolation, upload limpio y descarga autorizada, EICAR como
   `MALWARE_DETECTED` sin blob ni staging, outage fail-closed, workers y
   sincronización fijada.
10. Declarar el resultado operativo. Este dry-run no contiene ni implica
    `GO PRODUCCIÓN`; ese paso requiere autorización posterior explícita.

## Rollback sin DROP ni pérdida de datos

- Si falla antes de migrar, detener la promoción y mantener el servicio
  anterior.
- Si falla después de una migración aditiva, detener tráfico nuevo, volver al
  artefacto anterior compatible y conservar las columnas/tablas nuevas sin
  ejecutar migraciones reversas destructivas.
- Si falla la lectura/escritura, autenticación, JWKS, scanner, backup o smoke,
  abortar. No borrar datos ni intentar `migrate reset`, `DROP`, `TRUNCATE` o
  `prisma migrate deploy` en una base productiva como reparación.
- Si se requiere recuperación de datos, usar el backup verificado y un destino
  de recuperación aprobado por Operaciones; probar primero el restore en
  disposable y registrar checksum antes de cualquier decisión posterior.
- Reintentar solo después de identificar la causa, conservar logs redacted y
  volver a comprobar los SHAs. No cambiar a `main` flotante.

## Criterios de aborto

Abortar ante cualquier checksum remoto distinto, transferencia R2 no
verificable, restore no reproducible, secreto en logs, endpoint productivo no
HTTPS, mismatch de issuer/audience/JWKS, token de servicio inválido, readiness
503 persistente, ClamAV no saludable, EICAR con `VALIDATION_ERROR` o cualquier
resultado distinto de `MALWARE_DETECTED`, blob/staging residual, migración no
aditiva sin aprobación, `DROP`/`TRUNCATE` no revisado, smoke fallido o
dependencia fuera de los pins revisados.

## Resultado de este trabajo

El backup/restore remoto disposable en R2 no productivo quedó validado y los
pins/workflow quedan documentados para revisión de Operaciones. La producción
permanece bloqueada hasta una autorización posterior explícita; no se ejecutó
ninguna acción de producción.

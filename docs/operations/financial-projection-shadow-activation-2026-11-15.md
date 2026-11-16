# Proyección financiera v2 en sombra y conciliación — 2026-11-15/16

Ventana autorizada por el operador el 2026-11-15 para el paso 3 de
[ADR-0025](../decisions/ADR-0025-data-authority-and-annual-cycle.md):
desplegar el contrato v2, encender la proyección **solo en sombra**, conciliar
Académico con el roster de BL-002 y corregir las diferencias encontradas.
Horas en UTC. No se registran secretos, tokens, nombres ni RUN/IPE.

Resultado: **242 de 242 alumnos y 12 de 12 cursos vinculados por
`integrationId`, sin diferencias.** El publisher de Académico, el modo
escritura de BL y el worker del sync heredado siguen apagados.

## Código integrado

| Repositorio | PR  | Merge                                      | Contenido                                                  |
| ----------- | --- | ------------------------------------------ | ---------------------------------------------------------- |
| Académico   | #36 | `a7924a2aa4365a53eacff339ad7d3918dd73eaa8` | Contrato v2: alumno, RUN/IPE, curso y año; reproyección    |
| BL-002      | #8  | `33ffdafbbb82180a1d40d6473fe0b851daee4b22` | Consumidor v2 en sombra y conciliación por `integrationId` |
| Académico   | #37 | `bce26361d145da21bf4f259a82032075e556ed71` | Baja de matrículas manuales y matrículas por revisar       |

## Artefactos desplegados (el operador ejecutó cada redeploy)

| Recurso                                             | Imagen                                                                                                                                                | Observado                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| API `iobfkpujjoa2kj5urbpnjvzi` (a7924a2)            | `ghcr.io/sherydans12/edupay-academico@sha256:eecd1c5fd453b5492a6068fa032577038f784b88d915a1b5b6613bfae0ab94c9`                                        | Healthy; live/ready 200; reemplazado por la fila siguiente                                               |
| API `iobfkpujjoa2kj5urbpnjvzi` (bce2636, vigente)   | `ghcr.io/sherydans12/edupay-academico@sha256:23dff3c8c61051b5bb55236f109292c5e10d946aaae634248d86a6ff126880f7`                                        | Healthy desde 2026-11-16 00:29:41; ready 200; `GET /course-enrollments/inconsistent` 401 sin sesión      |
| FRONT `cct0rtf5iku6fkd3t9hldnv4` (bce2636, vigente) | `ghcr.io/sherydans12/edupay-academico-web@sha256:0e6051236de6222d821be2e4dcf9045366c54b489388c2e04a60beba02b28d94` (tag `main`)                       | Healthy desde 2026-11-16 00:31:26; panel "Matrículas por revisar" observado con sesión de administración |
| BL BACK                                             | Construido por Coolify desde `33ffdaf`; ver [BL-002 PRODUCTION](https://github.com/Sherydans12/BL-002-EduPay/blob/main/docs/operations/PRODUCTION.md) | Healthy; `/api/v1/health` 200                                                                            |

Las imágenes del API se publicaron con el workflow manual
`Publish Academic API runtime` (runs 43772147953 y 43778422876); la del FRONT,
con el workflow automático de `main` (run 43778382730). Rollback del API:
digest anterior `sha256:c988b07a80a5e43363472045d06c795bbe329514b7d1ca9272152d5f49b7a4f8`
(3a06df4); no hubo migración de Académico en esta ventana.

## Secuencia

1. **Recovery point BL** `20261115T230006Z`: `pg_dump` y uploads con
   SHA-256, restauración aislada idéntica a la base viva. Detalle en BL-002.
2. **Migración BL** `20261115160000_academic_financial_projection_v2_descriptors`
   aplicada dentro de BL BACK `33ffdaf` (checksum
   `7c040eeda9104b4483ca1123c917884e52e34cc7625e99658fbf079402d12e3f`).
3. **Mapping de tenant** en BL: `colegio-conquistadores` ↔
   `6dc797a8-2012-4c28-b212-c1449109a12f` (único tenant de Académico),
   `dryRun` aprobado y asignación a las 23:17:32. El UUID se tomó de
   Académico; la base de Identity no se consultó directamente.
4. **Sombra encendida** por el operador en Coolify. API:
   `ACADEMIC_FINANCIAL_PROJECTION_ENABLED=true`,
   `ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS` (keyId `bl-shadow-2026-11`)
   y `ACADEMIC_FINANCIAL_PROJECTION_CURSOR_SECRET`; publisher **sin activar**.
   BL: `ACADEMIC_FINANCIAL_PROJECTION_ENABLED=true`,
   `ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS` y
   `ACADEMIC_FINANCIAL_PROJECTION_BASE_URL=https://academico-api.edupay.baselogic.cl`;
   sin credencial entrante. Se comprobó por hash, sin leer valores, que ambas
   credenciales son idénticas.
5. **Primer snapshot y conciliación:** 242 matrículas; 241 alumnos y 12 cursos
   vinculados; 1 alumno solo en BL (creado en BL el 2026-10-06, después del
   último sync del 2026-09-23); 1 alumno y 1 curso "nuevos" en Académico
   (registro de prueba `MANUAL`). Los 246 alumnos / 15 cursos de BL citados en
   ADR-0025 incluían el tenant `colegio-pruebas` (4 / 3).
6. **Recovery point Académico** `20261115T234253Z` (servicio de backup,
   verificado en R2).
7. **Sync heredado incremental, una corrida manual** dentro del API:
   `node dist/sync/sync-run-main.js --tenant-id 6dc797a8-… --mode incremental`.
   Medido antes: 2 alumnos y 0 cursos cambiados en BL desde las marcas de agua
   (1409/1410). Run `d3e6a1b2-0900-4376-b8e4-4c223e949846` `SUCCEEDED`:
   1 creado, 1 actualizado, 0 desactivados, 0 conflictos. Alumnos 253 → 254,
   `EDUPAY` 251 → 252, matrículas activas 242 → 243. El worker sigue detenido.
8. **Baja de la matrícula de prueba** `3797d18c-0d2e-4c5e-a3d2-3baac237eb81`
   (curso archivado, alumno inactivo) por el operador desde el panel nuevo, a
   las 00:36:30: `INACTIVE`, versión 2, evento
   `enrollment.tombstoned.v2` `PENDING` (publisher apagado).
9. **Snapshot final** `e98f1f47-9a6c-49c4-98f6-090c36b6844b`: 243 ítems
   (242 activos + la baja), `reconciled=true`, sin faltantes ni sobrantes.

## Conciliación final

|         | Académico | BL  | Vinculados | Diferencias |
| ------- | --------- | --- | ---------- | ----------- |
| Alumnos | 242       | 242 | 242        | 0           |
| Cursos  | 12        | 12  | 12         | 0           |

Sin RUN distintos, referencias inexistentes ni duplicados; año 2026 con 242
matrículas activas; `readyForWriteMode=true`.

## Incidentes y lecciones

- La terminal web de Coolify se reconectó dos veces a contenedores ajenos
  (`baselogic-argos-pilot-api-1` y `api-etwmcdk0yyyk0nakxy68itso-…`). No se
  ejecutó nada en ellos. Antes de escribir, confirmar en pantalla
  `localhost · Server` y `root@srv1524006`.
- El sync heredado no encola eventos de proyección; las altas que hace solo
  llegan a la sombra por snapshot.

## Pendiente

- Antes de encender el publisher: que el sync heredado encole eventos de
  proyección (o retirarlo con el traspaso de autoridad `EDUPAY`) y cargar en BL
  `ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS`.
- Modelo por año en BL y modo escritura (ADR-0025, paso 4).
- El evento `tombstoned.v2` de la matrícula de prueba queda en outbox hasta que
  se encienda el publisher; BL ya lo refleja por snapshot.

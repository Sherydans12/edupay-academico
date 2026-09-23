# DIE v1 — preparación para revisión de release

Fecha de evidencia: 2026-09-22/23 (America/Santiago)

PR Académico: #10, rama `codex/die-educational-inclusion-v1`

PR Identity: #12, rama `codex/die-membership-verification`
Base verificada de ambos repositorios: `origin/main` sin cambios nuevos al momento del gate.

Este documento separa deliberadamente requisitos aprobados, elecciones técnicas implementadas y decisiones aún no aceptadas. Que una elección esté en código no la convierte en decisión de producto aprobada.

## 1. Contrato agregado por Identity PR #12

PR #12 agrega únicamente `POST /internal/v1/tenant-memberships/verify` y su contrato interno. No agrega una búsqueda ni un directorio.

Solicitud:

- `actor.identityUserId`, `actor.sessionId`, `actor.membershipId` y `actor.tenantId`, todos provenientes del principal ya validado por Académico;
- `targetIdentityUserId`, obtenido por Académico desde el `Teacher` tenant-scoped elegido mediante `teacherId`, no desde un identificador de identidad libre enviado por el navegador.

Quién puede invocarlo:

- sólo un consumidor servidor que presente `Authorization: Bearer <service token>`;
- el token vigente es `IDENTITY_ACADEMICO_SERVICE_TOKEN`; existe soporte opcional de token anterior únicamente durante un solapamiento explícito máximo de 24 horas;
- el guard rechaza `Origin` de navegador, cuerpos sobre 16 KiB y credenciales no válidas usando comparación de digests SHA-256 con `timingSafeEqual`;
- producción exige un secreto aleatorio de al menos 32 bytes;
- después de autenticar el servicio, Identity revalida que usuario, sesión, membership seleccionada y tenant del actor estén activos y correspondan exactamente. No existe acceso implícito por `SYSTEM_ADMIN`.

Respuesta exitosa mínima:

- `verified: true`;
- `identityUserId`, `membershipId` y `tenantId` opacos;
- `membershipStatus: ACTIVE`;
- códigos de roles vigentes ordenados.

No devuelve nombre, correo, login, credenciales ni tokens. No modifica memberships ni concede roles.

No enumeración y aislamiento:

- la consulta de destino usa simultáneamente el `targetIdentityUserId` exacto y el `tenantRealmId` del actor revalidado;
- destino desconocido, inactivo o perteneciente a otro tenant produce la misma respuesta 404 no enumerable;
- actor revocado produce 403;
- no hay parámetros de texto, paginación, lista o búsqueda;
- las pruebas `test/internal-academic.integration-spec.ts` cubren actor no administrador válido, destino exacto, destino cross-tenant/inactivo, actor revocado y rechazo de entradas con forma de directorio;
- auditoría registra IDs opacos, categoría, cantidad de roles y request ID; no registra PII ni el service token.

Académico acepta como miembro DIE sólo una respuesta exacta del mismo usuario y tenant, estado `ACTIVE` y al menos un rol vigente `TEACHER` o `TENANT_ADMIN`. Un destino `STUDENT`-only falla 403. `APODERADO` no existe como rol aceptado por el verificador JWT de Identity; cualquier rol desconocido se rechaza antes de establecer contexto. La incorporación siempre crea rol local DIE `MEMBER`: el cliente no puede pedir `COORDINATOR` ni un rol global.

## 2. Decisiones y estado de aprobación

### Requisitos confirmados

- admin de tenant entra sin membresía DIE local;
- admin, coordinador y miembro ordinario pueden incorporar miembros ordinarios del mismo tenant;
- incorporar un miembro no concede coordinación, administración del tenant ni roles Identity;
- registros compartidos, sin notas privadas por profesional;
- profesor sin asignación DIE, estudiante y rol no reconocido quedan excluidos;
- una sola atención activa por alumno, con episodios finalizados y reanudados históricos;
- correcciones versionadas, autoría original inmutable y anulaciones sin borrado habitual;
- adjuntos privados, PDF filtrado/auditado y ninguna proyección DIE hacia BL;
- no hay purga automática, legal hold ni eliminación definitiva habitual implementados.

### Política confirmada en esta revisión

1. **Coordinación:** sólo `TENANT_ADMIN` concede o retira `COORDINATOR`.
2. **Retiro:** admin o coordinador retira miembros ordinarios; sólo admin retira coordinadores; se impide auto-retiro. Acciones abiertas y responsabilidades de acompañamientos activos deben reasignarse en la misma transacción.
3. **Revocación/reingreso:** cada autorización revalida sesión/membership en Identity y exige el `membershipId` exacto guardado en la asignación DIE. Una membership nueva no hereda acceso; un actor autorizado debe incorporar nuevamente la identidad elegible.
4. **Perfil operativo:** Académico mantiene nombre institucional y zona IANA tenant-scoped, editables sólo por `TENANT_ADMIN`, con historial durable. El contrato y migración se definen en `docs/proposals/tenant-operational-profile.md`.

### Decisión nueva que requiere respuesta

Identity no tiene hoy una categoría de personal no docente: una membership debe tener roles y los únicos roles tenant son `TENANT_ADMIN`, `TEACHER`, `STUDENT` y `GUARDIAN`. Crear un `Teacher` ficticio o conceder `TEACHER` violaría el alcance.

Recomendación concreta pendiente de aceptación: agregar en Identity el rol tenant-scoped `STAFF`, sin capacidades académicas o administrativas implícitas, y permitir que `TENANT_ADMIN` lo provisione mediante el ciclo de cuentas existente. La membership de aplicación `STAFF` sólo declara que la cuenta corresponde a personal del tenant; la asignación local DIE en Académico continúa siendo la única concesión de acceso DIE. `STUDENT` y `GUARDIAN` siguen siendo inelegibles aunque alguien intente incorporarlos.

Contrato mínimo adicional recomendado: resolución exacta server-to-server por `institutionalUsername`, no un listado. Identity revalida al actor y deriva su tenant; devuelve únicamente usuario/membership opacos y roles si el destino está ACTIVE y posee `STAFF`, `TEACHER` o `TENANT_ADMIN`. Desconocido, excluido y cross-tenant responden igual. Así el navegador no aporta IDs de Identity y no puede enumerar otros tenants. No se implementa este cambio transversal hasta aceptación explícita.

Hasta desplegar y configurar el perfil, el PDF no se presenta como release-complete. La nueva API impedirá la exportación si falta el nombre en vez de sustituirlo por el UUID.

Políticas futuras de purga o legal hold continúan fuera de alcance y no están implementadas.

## 3. Matriz breve de requisito, implementación y prueba

| Requisito                                                      | Implementación                                                                                                                      | Evidencia concreta                                                                              | Estado                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Admin sin membresía DIE                                        | `DieAccessService.require` permite `TENANT_ADMIN` antes de buscar asignación local                                                  | `die-domain.e2e-spec.ts`: “grants admins automatically…”                                        | Conforme                                           |
| Miembro ordinario incorpora ordinario, sin elevar coordinación | `addMember` autoriza acceso DIE y fija `role=MEMBER`; cambio de rol exige admin                                                     | E2E “lets every DIE member add…” y “keeps coordination tenant-admin-only…”                      | Conforme; política final de coordinación pendiente |
| Profesor, estudiante y apoderado excluidos                     | permiso backend DIE + validador JWT de roles cerrados                                                                               | E2E profesor y `STUDENT` 403; specs JWKS rechazan rol desconocido                               | Conforme                                           |
| Identidad excluida no puede incorporarse                       | candidato se resuelve por `teacherId` tenant-scoped; verificación S2S exige mismo tenant/usuario, ACTIVE y `TEACHER`/`TENANT_ADMIN` | E2E “rejects… only an excluded role”; Identity integración cross-tenant/inactivo                | Conforme                                           |
| Membership revocada                                            | revalidación Identity en cada operación sensible, sin caché de autoridad                                                            | E2E de adjunto: descarga y PDF 403 al responder membership inactiva                             | Conforme                                           |
| Usuario retirado y reingreso                                   | `removedAt` invalida asignación; nueva membership ID no coincide y no hereda                                                        | E2E de adjunto: retiro, descarga/export 403 y replacement membership 403                        | Conforme; política de reingreso pendiente          |
| Expediente finalizado conserva consulta                        | episodios append-only; bitácora histórica sigue asociada                                                                            | E2E serialización/historial consulta journal y PDF después de finalizar, antes de reanudar      | Conforme                                           |
| Adjuntos sin acceso alternativo                                | si un `FileObject` tiene cualquier referencia DIE, DIE domina y no se evalúan permisos académicos generales                         | E2E crea además referencia de learning visible al outsider y mantiene descarga 403              | Conforme; bypass corregido en esta revisión        |
| Cross-tenant                                                   | claves compuestas/queries con tenant confiable y 404 seguro                                                                         | E2E miembro, expediente, adjunto y export cross-tenant                                          | Conforme                                           |
| Corrección/anulación                                           | revisiones append-only; autor original separado del corrector; estado `VOIDED`                                                      | E2E “versions corrections…” y PDF visual con `[ANULADO]`                                        | Conforme                                           |
| Fecha sin hora / hora aproximada                               | fecha SQL `date`; minutos y zona nullable; aproximada requiere hora                                                                 | contratos y E2E; PDF sintético muestra registros date-only sin hora inventada                   | Conforme salvo zona canónica por tenant            |
| Cuota/formato/scan                                             | storage privado común, allowlist DIE y reserva/confirmación transaccional; ClamAV fail-closed                                       | gate ClamAV real y storage E2E                                                                  | Conforme                                           |
| Export filtrado, protegido y auditado                          | mismo `require`, filtros server-side, evento `DIE_STUDENT_PDF_EXPORTED` sin contenido                                               | E2E PDF con filtros/tenant/revocación y auditoría; inspección visual A4                         | Parcial: falta nombre institucional canónico       |
| Sin datos DIE en BL                                            | proyección sólo selecciona enrollment/student/course y contrato v1 cerrado                                                          | `academic-financial-projection.contract.e2e-spec.ts`; revisión estática sin imports/queries DIE | Conforme                                           |
| Sin contenido sensible en logs/errores                         | auditoría DIE guarda acción/IDs/conteos; scanner guarda códigos; filtro 5xx enmascara respuesta                                     | specs Identity HTTP no exponen token/body; revisión de llamadas logger/audit                    | Conforme con el alcance revisado                   |

## 4. Migración y compatibilidad

### Ensayo ejecutado en PostgreSQL 15 desechable

1. `origin/main` (`a9f0cc4ab3edf079e5988f15284aa63e5d21aa51`) aplicó exactamente sus 10 migraciones.
2. Se sembraron datos sintéticos representativos: tenant, año, curso, alumno con acentos, matrícula, evento `PENDING` del ledger financiero, `StoredBlob`, `FileObject` y archivo físico local.
3. Se aplicó únicamente `20260922120000_die_educational_inclusion` desde el PR.
4. Resultado: 11 migraciones finalizadas, siete tablas DIE, alumno/matrícula intactos, ledger `PENDING|0` intacto, metadatos de archivo intactos y hash SHA-256 físico idéntico antes/después.
5. El binario anterior se compiló desde ese `origin/main`, arrancó contra el esquema de 11 migraciones y respondió readiness 200 con checks `database`, `storage` y `malwareScanner` en `ok` usando ClamAV real. No ofrece rutas DIE, como corresponde.

La migración es expand-only respecto de las primeras diez: crea enums/tablas/índices DIE y extiende referencias/categorías de storage; no renombra ni elimina columnas anteriores. `event_time_zone` es nullable para no inventar zona en hechos sin hora.

### Matriz de versiones

| Identity | Académico | Resultado                                                                                                                                            |
| -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| anterior | anterior  | baseline actual                                                                                                                                      |
| nuevo    | anterior  | compatible: la ruta nueva es aditiva y no es invocada                                                                                                |
| anterior | nuevo     | lectura de asignaciones DIE existentes funciona usando status de sesión; incorporar miembros falla cerrado porque falta `/tenant-memberships/verify` |
| nuevo    | nuevo     | funcionalidad completa cubierta por E2E/gate                                                                                                         |

### Orden propuesto de despliegue (no ejecutado)

1. Backup/verificación operativa de PostgreSQL y storage conforme al runbook vigente.
2. Identity PR #12; smoke de auth S2S y no enumeración.
3. Migración Académico DIE con el job de migración separado; verificar ledger 11 y checks de integridad.
4. API Académico; smoke admin/miembro/revocación/adjunto/PDF.
5. Web Académico sólo después de API saludable y después de resolver metadata institucional/zona canónica.

Rollback por recurso:

- Web: volver al artefacto anterior; no cambia datos.
- API Académico: volver al binario anterior, probado compatible con el esquema nuevo. Mantener la migración; no ejecutar down migration destructiva.
- Migración: no revertir tablas con datos. Si el release se cancela, dejarlas inactivas y planificar rollback de datos por separado.
- Identity: puede permanecer desplegado porque la ruta es aditiva. Si debe volver atrás, primero volver Académico; Académico nuevo + Identity anterior falla cerrado sólo al incorporar miembros.
- Storage: conservar blobs/objetos privados; no purgar archivos al rollback de aplicación.

## 5. Gate ClamAV real y evidencia PDF

El smoke `scripts/pilot-cross-service-smoke.mjs` se ejecutó localmente con:

- Identity fijado exactamente al SHA revisado de PR #12;
- PostgreSQL 15 separados y desechables;
- imagen ClamAV fijada por digest y adaptador `ClamAvMalwareScanner` real;
- credenciales locales efímeras y salida sanitizada por el propio runner.

Checkpoints aprobados:

- ClamAV/clamd saludable;
- archivos permitidos limpios permanecen disponibles;
- EICAR generado dinámicamente se rechaza, no se publica y no se descarga;
- al detener el scanner, readiness falla y upload falla cerrado;
- multipart, cuota exacta y deduplicación tenant-local;
- formato prohibido e incompatibilidad MIME/firma cubiertos por validación y specs;
- descarga cross-tenant y sesión revocada denegadas;
- staging vacío y contabilidad de blobs/cuota consistente;
- `PASS full real-service pilot cross-service smoke`.

El PDF sintético se generó mediante el endpoint/exportador real con 14 registros extensos, acentos, fechas sin hora, un registro anulado, una acción relacionada y filtros explícitos. `pdfinfo` confirmó A4, 4 páginas, sin JavaScript ni cifrado. Se renderizaron todas las páginas a PNG y se revisaron visualmente: acentos, wrapping, marca roja de anulación, motivo, acciones y pies `Página n de 4` son legibles. El gate visual descubrió y corrigió un bug que duplicaba páginas en blanco al agregar el pie.

Limitación visible en la evidencia: el encabezado muestra tenant técnico, no nombre institucional. Esto es intencionalmente explícito y sigue siendo un bloqueo de conformidad, no una identidad inventada.

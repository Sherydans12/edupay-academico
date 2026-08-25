# Inventario explícito del release candidate — Fases 4 y 5

Fecha de corte: 2026-08-25
Estado: candidato local, sin merge, push, deploy ni migración productiva.

## Baselines y registro inicial

El worktree auditado inicialmente fue:

- Rama: `codex/course-builder-phase5`.
- `HEAD`: `0149c397990d1f78294beb53533ae8c9272f5828` (`feat: implementa validación T-03 403 en TrustedTenantContext y tests unitarios`).
- Estado capturado con `git status --porcelain=v1`: 311 entradas; 287 archivos tracked modificados, 24 entradas no rastreadas y 0 eliminados. Expandido con `--untracked-files=all`, el estado corresponde a 330 archivos: 287 tracked modificados, 43 archivos no rastreados y 0 eliminados.
- Dentro de los tracked modificados había 137 rutas de `.claude`; se clasificaron como heredadas y no pertenecientes a este release.
- El inventario completo de paths se contrastó contra la superficie candidate; todo path no listado como incluido abajo quedó excluido.

El worktree candidato es el hermano limpio:

- Ruta: `C:\Users\nicol\Documents\EduPayAcademico-worktrees\course-builder-release-candidate-main`.
- Rama: `codex/course-builder-release-candidate-main`.
- Base inmutable: `main` en `5b0ad1f5f8ab0552ed1c502f30840b4afcc13fd8` (`docs: refresh release validation evidence`).
- Base histórica del RFC: `5ca88a9`; se conserva como referencia del RFC, no como base operativa del candidato.

Se usó `main` como baseline operativo porque el `HEAD` de `codex/course-builder-phase5` conserva una variante anterior de `TrustedTenantContext` que no compila con la superficie académica vigente. La selección no copia los cambios de Identity del worktree original; usa el baseline ya versionado y compatible de `main`. No se modificó el worktree original.

## Estado de cada ruta incluida

`existente` significa que la ruta ya estaba en el baseline `main`; `nueva` significa que se incorpora como archivo propio de la entrega. En rutas compartidas se revisó el diff contra `main` por hunk y se retuvieron únicamente los cambios necesarios para Fase 4/Fase 5 y sus contratos aditivos.

| Ruta | Fase propietaria | Motivo | Estado base | Estado incluido en el candidate | Exclusión justificada |
|---|---|---|---|---|---|
| `apps/api/.env.example` | F5 | Flag de dual-read del body document | existente | `ACADEMIC_BODY_DOCUMENT_READ_ENABLED` documentado | No contiene secretos ni cambios de Identity. |
| `apps/api/prisma/schema.prisma` | F4/F5 compartido | `CommandReceipt`, orden sparse y columnas JSONB/versionadas del body document | existente | Sólo campos/enums/modelos aditivos de comandos y body document | No se eliminan scalars legacy ni se cambian límites de tenant. |
| `apps/api/prisma/migrations/20260824140000_command_receipts_and_sparse_ordering/migration.sql` | F4, prerequisito de contrato | Persistencia additive de idempotencia/orden | nueva | Incluida como dependencia necesaria del contrato F4 | No es migración productiva; no se ejecutó `migrate deploy`. |
| `apps/api/prisma/migrations/20260825113000_add_learning_body_document/migration.sql` | F5 | Columnas JSONB y backfill determinista | nueva | Incluida; conserva datos scalar | Rollback documentado sin `DROP COLUMN`. |
| `apps/api/src/academic/academic-context.ts` | F4, compatibilidad | Propaga `idempotencyKey` en el request context | existente | Campo opcional, sin cambio de autenticación | No agrega autoridad ni lógica de Identity. |
| `apps/api/src/learning/learning.controller.ts` | F4/F5 compartido | Comandos idempotentes, lectura compatible y endpoints de body/history | existente | Sólo rutas/payloads requeridos por ambos manifiestos | No se agregan notificaciones ni sincronización. |
| `apps/api/src/learning/learning.mapper.ts` | F5 | Mapea body document y fallback scalar | existente | Mapeo dual-read aditivo | No cambia credenciales ni ownership de Identity. |
| `apps/api/src/learning/learning.module.ts` | F4/F5 | Registra servicios de comando/lectura/body | existente | Wiring de dependencias candidate | Se conserva sólo infraestructura académica existente. |
| `apps/api/src/learning/learning.service.ts` | F4/F5 compartido | Idempotencia, stale revision, reorder, body document, drafts, publish/history/restore | existente | Diff revisado por hunk; conserva scalars y fallback legacy | Cambios de notificación/sync/Identity no son superficie propia; no se añadió integración externa. |
| `apps/api/src/learning/body-document.ts` | F5 | Validación, backfill, límites y referencias autorizadas | nueva | Incluida con pruebas | No contiene editor ni publicación de Fase 6. |
| `apps/api/src/learning/body-document.spec.ts` | F5 | Pruebas de contrato/validación/backfill | nueva | Incluida | Datos sintéticos. |
| `apps/api/src/learning/idempotency/command-idempotency.service.ts` | F4, prerequisito de contrato | Ejecución idempotente de comandos | nueva | Incluida | No es un nuevo dominio funcional fuera de F4. |
| `apps/api/src/learning/idempotency/command-idempotency.service.spec.ts` | F4 | Casos positivo, replay y conflicto | nueva | Incluida | Sin secretos. |
| `apps/api/src/learning/ordering/sparse-ordering.service.ts` | F4, prerequisito de contrato | Posiciones sparse y reordenamiento estable | nueva | Incluida | No incluye DnD. |
| `apps/api/src/learning/ordering/sparse-ordering.service.spec.ts` | F4 | Pruebas de orden/idempotencia | nueva | Incluida | Sólo casos del builder. |
| `apps/api/src/learning/read/learning-read.constants.ts` | F5 | Flag y constantes de dual-read | nueva | Incluida | No es una sincronización externa. |
| `apps/api/src/learning/read/learning-read.mapper.ts` | F5 | Proyección segura para lectura | nueva | Incluida | Fallback scalar explícito. |
| `apps/api/src/learning/read/learning-read.mapper.spec.ts` | F5 | Pruebas de proyección/fallback | nueva | Incluida | Sin Fase 6. |
| `apps/api/src/learning/read/learning-read.module.ts` | F5 | Wiring del read model | nueva | Incluida | Sólo dominio Académico. |
| `apps/api/src/learning/read/learning-read.service.ts` | F5 | Lectura dual y visibilidad | nueva | Incluida | No posee persistencia de Identity. |
| `apps/api/src/learning/read/learning-read.types.ts` | F5 | Tipos de read model | nueva | Incluida | Sin contrato de notificaciones/sync. |
| `apps/api/src/learning/read/learning-visibility.policy.ts` | F5 | Visibilidad teacher/student compatible | nueva | Incluida | No habilita acciones teacher-only para alumnos. |
| `packages/contracts/src/index.ts` | F4/F5 | Exporta contratos nuevos | existente | Exportes aditivos | No cambia contratos de Identity. |
| `packages/contracts/src/learning.ts` | F4/F5 compartido | Body document, revisions, idempotency y reorder | existente | Schemas y tipos necesarios, manteniendo legacy | No se reemplazan scalars legacy. |
| `packages/contracts/src/learning-commands.spec.ts` | F4 | Pruebas de payloads de comandos | nueva | Incluida | Sólo comandos del builder. |
| `packages/contracts/src/learning-read.ts` | F5 | Contrato de lectura dual | nueva | Incluida | Sin Fase 6 ni sincronización. |
| `packages/contracts/src/learning-read.spec.ts` | F5 | Pruebas del contrato read | nueva | Incluida | Datos sintéticos. |
| `packages/contracts/src/storage.ts` | compatibilidad F4/F5 | Tipos requeridos por el cliente académico compartido | existente | Incluida como dependencia compatible, sin cambio funcional de storage en este release | No es una feature propia; cualquier evolución de storage queda fuera. |
| `apps/web/src/api/academic-client.ts` | F4/F5 compartido | Envía idempotency/revisions/body y consume read/history | existente | Métodos y payloads necesarios para candidate | No se agregan clientes de Identity. |
| `apps/web/src/api/academic-client.spec.ts` | F4/F5 | Pruebas de requests y headers/payloads | existente | Casos necesarios del candidate | No se incluyen pruebas de sincronización. |
| `apps/web/src/components/body-document.tsx` | F5 | Renderer seguro compatible | nueva | Incluida | Sin edición/publicación del lado alumno. |
| `apps/web/src/components/body-document.spec.tsx` | F5 | Pruebas de renderer y estados | nueva | Incluida | No prueba Fase 6. |
| `apps/web/src/components/content-history-drawer.tsx` | F5 | Historial/restauración de contenido | nueva | Incluida | Acción sólo teacher autorizada. |
| `apps/web/src/components/icons.tsx` | F4/F5 | Iconos requeridos por builder/editor/history | existente | Cambios mínimos de presentación | Sin assets temporales. |
| `apps/web/src/components/markdown-renderer.tsx` | F5, compatibilidad | Renderer seguro reutilizado por body document | nueva | Incluida | No admite HTML inseguro ni acciones de alumno. |
| `apps/web/src/components/teacher-attachment-manager.tsx` | F4/F5, compatibilidad | Referencias a adjuntos autorizados desde editor | existente | Dependencia de UI compartida | No cambia storage ni reconciliación. |
| `apps/web/src/components/teacher-content-editor.tsx` | F5 | Editor teacher de bloques, preview, dirty/focus | nueva | Incluida | No se agrega editor student. |
| `apps/web/src/app/globals.css` | F5 | Estilos de body/editor/estados y responsive tooltip | existente | Sólo reglas candidate revisadas | No se incluyen estilos de pantallas heredadas como feature nueva. |
| `packages/ui/src/styles.css` | F5 | Corrección responsive compartida del tooltip | existente | Sólo bloque mobile requerido | No cambia el sistema de temas tenant-neutral. |
| `apps/web/src/features/course-builder/course-builder-reducer.ts` | F4 | Proyección optimista/rollback | nueva | Incluida | Sin DnD ni refetch ordinario global. |
| `apps/web/src/features/course-builder/course-builder.tsx` | F4/F5 compartido | Orquestador, feature flag, comandos y editor de body | nueva | Incluida | Sólo F4/F5; no Fase 6. |
| `apps/web/src/features/course-builder/course-outline.tsx` | F4 | Árbol optimista de unidades | nueva | Incluida | Sin funcionalidad ajena. |
| `apps/web/src/features/course-builder/index.ts` | F4 | Export surface del builder | nueva | Incluida | Sin API pública adicional. |
| `apps/web/src/features/course-builder/item-editor.tsx` | F4/F5 compartido | RHF dirty state y edición de body | nueva | Incluida | Sin editor student. |
| `apps/web/src/features/course-builder/item-row.tsx` | F4 | Acciones accesibles de item | nueva | Incluida | No DnD. |
| `apps/web/src/features/course-builder/move-item-dialog.tsx` | F4 | Movimiento entre unidades | nueva | Incluida | Sólo comandos aprobados. |
| `apps/web/src/features/course-builder/types.ts` | F4/F5 | Tipos del árbol/editor | nueva | Incluida | Sin tipos de Fase 6. |
| `apps/web/src/features/course-builder/unit-card.tsx` | F4 | Tarjeta memoizada de unidad | nueva | Incluida | Sin funcionalidad de administración. |
| `apps/web/src/features/course-builder/unit-editor.tsx` | F4 | Edición de unidad | nueva | Incluida | Sólo teacher workspace. |
| `apps/web/src/features/course-builder.spec.tsx` | F4 | Pruebas de reducer, dirty, stale 409 y foco | nueva | Incluida | Sin DnD. |
| `apps/web/src/features/teacher-screens.tsx` | F4/F5 compartido | Integra CourseBuilder manteniendo la ruta legacy | existente | Hunks revisados; integración del builder y body | No se añade una ruta de Fase 6. |
| `apps/web/src/features/student-screens.tsx` | F5 | Renderer body con fallback scalar | existente | Sólo el seam de lectura/renderer; no el archivo completo como feature | Se excluyen mejoras student, entregas y evidencia de Fase 6. |
| `apps/web/src/features/learning-screens.spec.tsx` | compatibilidad | Ajuste mínimo de fixtures/tipos para cliente compartido | existente | Sólo compatibilidad de compilación/pruebas | No agrega comportamiento de fase previa. |
| `apps/web/src/features/storage-submission-screens.spec.tsx` | compatibilidad | Ajuste mínimo de fixtures/tipos para cliente compartido | existente | Sólo compatibilidad de compilación/pruebas | No agrega storage/submissions al release. |
| `PHASE4_MANIFEST.md` | F4 | Fuente de alcance funcional | nueva | Incluida como trazabilidad | No contiene implementación. |
| `PHASE5_MANIFEST.md` | F5 | Fuente de alcance funcional | nueva | Incluida como trazabilidad | No contiene secretos. |
| `PHASE5_SCOPE_CONFLICT.md` | F5 | Resolución del conflicto de roadmap | nueva | Incluida como decisión de alcance | Mantiene notificaciones/sync fuera del candidate. |
| `PHASE5_RELEASE_CANDIDATE.md` | F4/F5 | Evidencia final de RC | nueva | Se actualiza con resultados reales | No declara GO de producción. |
| `PHASE4_5_RELEASE_INVENTORY.md` | F4/F5 | Este inventario y registro de exclusiones | nueva | Incluida | Artefacto permanente de trazabilidad, no temporal. |

## Exclusiones verificadas

Quedan fuera del candidate: `.claude/**` (137 cambios heredados), `PHASE2_PLAN.md`, `PHASE2_CLOSURE_PLAN.md`, el archivo literal `Fuera de alcance de esta vista`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, scripts `course-builder-lab*.mjs`, `docs/development/COURSE-BUILDER-LAB.md`, archivos de Identity, cambios de notificaciones/sincronización fuera del RFC incremental, la implementación completa de Fase 6, secretos, artefactos temporales y migraciones productivas. También se excluyen pruebas antiguas de fases previas que no son necesarias para compilar o validar este candidate.

La presencia de infraestructura académica compartida en `learning.service.ts`, el cliente y los fixtures no convierte en propias las features previas: son dependencias de compilación o hunks necesarios para ejecutar Fase 4/Fase 5. No se incluyó ningún archivo completo de `.claude`, Identity, Fase 6 ni del laboratorio.

## Migración y rollback

Las dos migraciones son additives. La de Fase 4 agrega receipts/revisiones de orden; la de Fase 5 agrega JSONB y backfill determinista conservando `body`, `content` e `instructions`. El rollback operativo es volver al commit anterior y mantener `ACADEMIC_BODY_DOCUMENT_READ_ENABLED=0`; no se debe eliminar columnas ni revertir destructivamente datos ya escritos. No se ejecutó migración productiva.

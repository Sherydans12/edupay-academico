# Cierre de fase — actualización de release 2026-09-14

**Cerrada la fase de remediación funcional, recuperación de versiones y limpieza
de recursos.** Estado: RELEASE_DEPLOYED_FLAGS_OFF / COOLIFY_CLEANUP_COMPLETED.
El release Académico y el tramo BL-002 quedaron desplegados con las
funcionalidades de proyección apagadas.
El cierre no declara terminadas las mejoras locales posteriores. La restauración
del backup real protegido de PostgreSQL BL-002 está verificada; no se certifica
por ello la consistencia completa de la base viva ni la cobertura íntegra de
uploads.

## Resultado y evidencia

## Estado final del release flags-off

- BL BACK ejecuta `16e208af6a50e5703bc8f6edd51d7ff11b9c6381`, deployment
  `nhwca59ptvsocugghdh0uiwv`, imagen/manifiesto local
  `sha256:85b202901f77a60cb120f0cc720b878f54e0e570da4d8c191d3040ee511ef64f`;
  BL FRONT conserva `502e6463464de0a54b440362a64da0c31450818f`.
- Se aplicaron sólo `20260903090000_add_tenant_canonical_mapping` y
  `20260903113000_add_academic_financial_projection_shadow`. El ledger BL final
  contiene 36 intentos: 28 aplicaciones efectivas, 8 reversiones históricas
  resueltas y 0 fallos/no resueltos. `prisma migrate status` quedó al día.
- `RUN_MIGRATIONS=false`; producer, publisher y shadow apagados; no hay nuevos
  mappings ni credenciales S2S productivas. BL FRONT/BACK permanecen en
  `Manual deployments only`.
- No se ejecutó rollback. La imagen anterior conservada para BL BACK es
  `sha256:0b15f903be869ac7467b4d23f6ca25f11c9689575291310e90c42d5be0cc3dab`.
- El candidato GHCR `c19015…` no fue desplegado por autorización pendiente del
  registry; no se expusieron credenciales.

| Comprobación | Evidencia al cierre |
|---|---|
| BL-002 frontend esperado | Usuario confirmó login, dashboard y módulos modernizados tras publicar 502e646 |
| Academic frontend esperado | Usuario confirmó login de estudiante; después confirmó pantallas recuperadas y navegación en 4f5ad28 |
| GET /learning | Usuario confirmó desaparición de los 500 después de reparación aditiva autorizada |
| Gates web Académico | 113 pruebas / 21 archivos, typecheck aprobado; lint sin errores y 12 advertencias del editor |
| Gates BL-002 | 40 pruebas seleccionadas y build Nest aprobados antes de promover FRONT y BACK |
| HTTPS y assets | Siete endpoints de login/health/live/ready/JWKS con 200 y TLS válido; bundles sin APIs cruzadas |
| Routing | Un propietario Traefik por cada dominio; HTTP→HTTPS al mismo dominio |
| Persistencia | Bases separadas; montajes conservados; no reset, DROP, TRUNCATE ni backfill |
| Backup Académico/Identity | Puntos pre/post reparación verificados localmente y en R2; timer activo |

Deployment BL BACK: `yvjpma0rzo8ncnqzgenvtp16`.
Deployment BL FRONT: `b5mpqqnqxop5e4g4swvg2jk5`.
Deployment Academic FRONT final: `wxgimhdhkeolqstf35psgwvh`.

El SHA 502e646 tiene código BL-002 más reciente que abc377, aunque existía un
deployment posterior de abc377. Academic 5840f04 aportaba target runtime pero
tenía un error de invocación de fetch; ebb879 corrigió el transporte y 4f5ad28
recuperó las pantallas locales esperadas, manteniendo esa corrección.
No usar timestamps de deployments como orden de versiones de código.

## Reparación aditiva Académico ya aplicada

La imagen API b2f489f esperaba dos columnas y una tabla ausentes. La comparación
read-only de 34 modelos detectó exactamente ese faltante. Se probó la reparación
en un PostgreSQL 15 temporal, sin red ni datos productivos, con copia del esquema.

El usuario autorizó explícitamente agregar body_document nullable a
learning_items y learning_item_drafts y crear command_receipts con sus índices
y FK. Se verificó el backup previo y se aplicó una sola transacción:

- Dos columnas JSONB nullable.
- Tabla command_receipts con PK/FK e índices acotados por tenant.
- Sin cambios de filas existentes, backfill, borrado o modificación de Identity.
- Sin ejecutar otras migraciones ni modificar el historial Prisma.

Hash SHA256 del SQL aplicado:
`299f85545b9803ede933a425715bb67e8817d260327d2289049fcd533b3295d5`.

La base ya tenía versionado antiguo registrado en
`20260820160800_add_content_revisions_drafts_and_versioning`.
La cadena posterior contiene `20260824140000_command_receipts_and_sparse_ordering`
y `20260825113000_add_learning_body_document`, con efectos parcialmente
superpuestos. La ausencia de faltantes de tablas/columnas **no demuestra**
igualdad del ledger ni autoriza reejecutar toda esa cadena.

Pendiente antes de cualquier próxima migración productiva: reconciliar efectos,
constraints/índices y ledger contra un clon, documentar la decisión y obtener
autorización del cambio concreto. Esta tarea no se ejecutó silenciosamente como
parte del cierre documental.

## Limpieza ejecutada

Se eliminaron 13 aplicaciones obsoletas/duplicadas, 2 servicios de migración,
el proyecto vacío EduPay Académico con sus 2 entornos y 2 redes huérfanas.
Las aplicaciones canónicas antiguas API Académico e Identity ya no existen.
El servicio pinned productivo no es la aplicación de prueba homónima eliminada.

Se guardó un dump de administración Coolify con catálogo validado y snapshots
privados. El job nativo se ejecutó sin borrar volúmenes/configuraciones y sin
limpieza Docker global. Las redes retiradas tenían únicamente al proxy y se
eliminaron tras desconectarlo, sin reiniciarlo.

Artefactos protegidos en la VPS:
`/root/edupay-remediation-20260911` y `/root/edupay-cleanup-20260911`.
Contienen evidencia y material de recuperación; **no copiarlos a Git**.
El inventario estructurado enumera las identidades retiradas para no recrearlas.

Rollback histórico: restauración inicial BL-002 y reversión del primer intento
de conexión de red Identity por fallo del verificador. La publicación final
del frontend recuperado y la limpieza no requirieron rollback.

## Bases limpias para continuar

Ambos repositorios publican `codex/production-stable-baseline`, con el código
funcional descrito en PRODUCTION.md y documentación de cierre. Los commits de
documentación no cambian el SHA/digest que está ejecutando Coolify.

- BL-002: FRONT `502e646`; BACK `16e208af6a50e5703bc8f6edd51d7ff11b9c6381`.
- Académico: frontend `4f5ad28`; API `e5bd78a3c0588df540878b130d7d22cd039cf7d1`;
  workers `b2f489f`. La rama estable no autoriza redeployar todo el monorepo.
- Con autorización explícita del usuario, main integra la base productiva y
  esta documentación mediante una fusión que conserva el historial. El árbol
  de aplicación BL-002 coincide con 502e646; el de Académico con 4f5ad28,
  cuyo apps/api coincide con b2f489f. No se promovió trabajo local pendiente.
- Worktrees originales: BL-002 en Documents/BL-002 y Académico en
  EduPayAcademico-worktrees/course-builder-evolution contienen trabajo previo
  pendiente. No fueron limpiados con reset, descartados ni publicados en bloque.
  La limpieza garantizada corresponde a los nuevos worktrees y sus ramas.
- Trabajo no promovido: rollover/años académicos e integración v2 de BL-002,
  reparación/borrado de almacenamiento de Académico y proyecciones financieras.
  Requiere revisión propia de contratos, datos, autorización y pruebas.

## Límites que deben permanecer visibles

1. La restauración del backup real protegido de PostgreSQL BL-002 está
   verificada. Sigue sin certificarse la consistencia completa de la base viva
   ni la cobertura/restauración íntegra de uploads; el backup
   Académico/Identity no los sustituye.
2. Ledger de migraciones Académico requiere reconciliación antes del próximo
   cambio de esquema. No quedan autorizaciones permanentes de migración.
3. Staging BL-002/Académico no fue certificado en este cierre. Admission
   preprod no es su entorno de pruebas.
4. La salud de workers no certifica que todos los tenants hayan sincronizado sin
   conflictos. No se ejecutó una reconciliación de negocio para esta documentación.
5. main quedó reconciliado con el código aprobado y la documentación. Los
   SHAs/digests de Coolify siguen identificando los artefactos en ejecución, no
   los commits documentales. BL FRONT/BACK tienen auto deploy manual; no
   cambiar pins implícitamente ni activar la proyección financiera.

Estos límites no invalidan las pruebas funcionales confirmadas; delimitan qué
se cerró y qué debe resolverse en el siguiente cambio afectado.

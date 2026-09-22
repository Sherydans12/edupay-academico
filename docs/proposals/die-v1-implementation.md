# Inclusión Educativa (DIE) - alcance y plan verificable v1

Estado: implementación completa en rama; pendiente ensayo PostgreSQL aislado  
Fecha de corte: 2026-09-22

## Requisitos confirmados

- Multiempresa, sin IDs ni reglas de Colegio Conquistadores fijadas en código.
- Administradores del tenant acceden sin alta DIE. Coordinadores y miembros DIE
  comparten los mismos antecedentes; no existen notas privadas por profesional.
- Administradores, coordinadores y miembros pueden incorporar miembros ordinarios
  elegibles del mismo tenant sin alterar permisos de Identity.
- Acompañamientos con episodios de inicio/finalización/reanudación y máximo uno
  activo por alumno.
- Bitácora cronológica filtrable, fecha del hecho separada de creación, hora
  opcional/aproximada, fuente presenciada o informada, contexto histórico de curso.
- Correcciones versionadas por autor propio; coordinadores/administradores pueden
  corregir a terceros con motivo y anular con motivo. No hay borrado habitual.
- Acciones con responsable DIE, vencimiento calculado, estados y reasignación
  trazable; vistas propias y de equipo.
- Adjuntos privados con formatos explícitos, cuota, validación y escaneo existentes.
- PDF filtrado, auditado y sin incrustar automáticamente archivos.
- Ningún dato DIE entra en BL, proyección financiera, exportaciones generales,
  cachés o logs.

## Hallazgos del repositorio

- No existe modelo, endpoint ni UI de hoja de vida/bitácora. Las menciones actuales
  sólo declaran que esa información está excluida de BL.
- `Student`, `CourseEnrollment`, `Course` y `AcademicYear` ya permiten derivar el
  contexto académico. Sus IDs siempre se consultan junto a `tenantId`.
- Identity es dueño de cuentas/memberships/roles. El bridge actual confirma enlaces
  exactos Student/Teacher, pero no confirma targets para un actor DIE no admin.
- El almacenamiento ya implementa objetos privados, 25 MB, cuota global/tenant,
  staging, validación de contenido, ClamAV fail-closed, deduplicación dentro del
  tenant y descargas autorizadas por referencia.
- La auditoría general actual es correlacionada pero basada en logs; DIE agrega
  evidencia durable mínima para sus operaciones sensibles.

## Modelo y permisos

| Agregado              | Regla principal                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `DieMemberAssignment` | Períodos de pertenencia; `COORDINATOR` o `MEMBER`; una asignación activa por usuario/tenant. |
| `DieSupportEpisode`   | Un episodio activo por alumno; reanudar crea otro episodio.                                  |
| `DieJournalEntry`     | Identidad estable, estado vigente/anulado, autor original y contexto académico capturado.    |
| `DieJournalRevision`  | Snapshot inmutable de contenido por versión y actor corrector.                               |
| `DieAction`           | Responsable habilitado, estados explícitos y vencimiento derivado.                           |
| `DieActionAssignment` | Historial inmutable de reasignaciones.                                                       |
| `FileReference`       | Nuevo tipo DIE, sólo descargable por policy DIE.                                             |
| `DieAuditEvent`       | Evidencia durable mínima de altas, bajas, correcciones, anulaciones, descargas y exports.    |

Matriz resumida:

| Acción                               | Admin tenant |    Coordinador | Miembro |
| ------------------------------------ | -----------: | -------------: | ------: |
| Consultar todo DIE                   |           sí |             sí |      sí |
| Incorporar miembro ordinario         |           sí |             sí |      sí |
| Conceder/retirar coordinación        |           sí |             no |      no |
| Retirar miembro ordinario            |           sí |             sí |      no |
| Crear acompañamiento/registro/acción |           sí |             sí |      sí |
| Corregir registro propio             |           sí |             sí |      sí |
| Corregir registro ajeno              |           sí | sí, con motivo |      no |
| Anular registro                      |           sí |             sí |      no |
| Exportar/descargar adjunto           |           sí |             sí |      sí |

## Contratos y seguridad

- Las rutas se publican bajo `/api/v1/die` y no aceptan `tenantId`.
- Identity añade una verificación interna exacta; Académico le pasa actor vigente y
  target derivado desde un `Teacher` académico del tenant. Respuesta mínima:
  `verified`, IDs opacos, estado ACTIVE y roles actuales.
- Toda ruta DIE ejecuta comprobación online del contexto Identity. La respuesta de
  Identity y los cuerpos DIE llevan `Cache-Control: no-store`.
- Búsquedas de alumnos/cursos reutilizan Académico y se limitan al tenant.
- Errores son no enumerativos. Auditoría y logs no contienen texto DIE ni PII.

## Migración y compatibilidad

La migración es aditiva: enums de almacenamiento, tablas/índices DIE y relaciones
opcionales. No renombra ni elimina columnas existentes. El API anterior conserva
sus contratos; categorías/tipos nuevos sólo aparecen en rutas DIE. La migración se
probará exclusivamente contra PostgreSQL aislado antes de proponer despliegue.

## Cortes de implementación

1. Autorización, verificación Identity, miembros y episodios de acompañamiento.
2. Bitácora, versiones/anulación y adjuntos privados.
3. Acciones, vencimiento y reasignación trazable.
4. PDF, navegación/UI responsive y validación visual/integrada.

## Criterios de aceptación verificables

- Casos positivos y negativos para admin, coordinador, miembro, profesor no DIE y
  estudiante; revocación local y de Identity.
- Dos tenants con UUIDs/IDs superpuestos; alterar IDs nunca cruza el tenant.
- Carrera concurrente al iniciar acompañamiento produce sólo uno activo.
- Finalización/reanudación y cambio de matrícula conservan episodios/contexto.
- Correcciones/anulaciones conservan autoría y revisiones completas.
- Acciones se asignan, reasignan, completan y cancelan con reglas de campos.
- Adjuntos DIE respetan lista reducida, escaneo, cuota, referencias y descarga DIE.
- PDF respeta filtros, fechas, anulados y acciones; export queda auditado.
- UI se revisa a 1440 px y 375 px; PDF sintético se renderiza y revisa visualmente.

## Estado de implementación al cierre del corte

- Los cuatro cortes están implementados en la rama: autorización/miembros,
  acompañamientos, bitácora/adjuntos, acciones y PDF/UI.
- Typecheck, lint sin errores, suites unitarias y builds de API/web/Identity están
  aprobados. La UI se inspeccionó en escritorio y a 390 px; el PDF sintético se
  renderizó a PNG y se revisó sin cortes ni desbordes.
- La suite E2E PostgreSQL cubre dos tenants, roles positivos/negativos, revocación,
  concurrencia, contexto histórico, versiones, cuotas/formatos y exportación. En
  este host quedó omitida porque Docker Desktop no inicia su engine por un fallo
  local al crear `dockerInference`; no se usó una base compartida como sustituto.
- No se ejecutó la migración fuera de un PostgreSQL aislado, ni se cambió BL, ni
  se activó despliegue alguno.

Decisiones realmente pendientes: contrato transversal de nombre institucional y
zona horaria por tenant; política de conservación, purga y legal hold; y ejecución
del ensayo de migración/E2E cuando exista un PostgreSQL aislado saludable.

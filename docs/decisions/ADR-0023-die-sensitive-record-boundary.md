# ADR-0023: límite de datos sensibles y autorización del módulo DIE

Estado: Aceptada para implementación por la instrucción de producto del 2026-09-22  
Fecha: 2026-09-22

## Contexto

Inclusión Educativa necesita una hoja de vida compartida por el departamento,
acompañamientos, acciones y adjuntos. Los antecedentes son sensibles, pertenecen
a Académico y no forman parte de Identity ni de BL/Pagos. Ocultar una ruta web no
protege búsquedas, descargas, exportaciones o identificadores alterados.

Identity ya entrega el tenant activo y la membresía en un JWT de corta duración,
y mantiene un bridge interno para comprobar estado vigente. No existe ni se
creará un rol global DIE. Académico ya dispone de aislamiento por tenant,
almacenamiento privado, cuotas, validación de tipo y escaneo de malware.

## Decisión

1. Académico es el único dueño de membresías departamentales, acompañamientos,
   bitácora, versiones, acciones, adjuntos y evidencia de exportación DIE. Nada de
   este agregado se incorpora al outbox o snapshot financiero.
2. Un `TENANT_ADMIN` activo accede sin una membresía DIE adicional. Los demás
   usuarios requieren una asignación DIE activa en el mismo tenant. Todas las
   rutas DIE vuelven a comprobar en línea el estado de la sesión y membresía en
   Identity y fallan cerradas si Identity no puede confirmar el contexto.
3. Cualquier administrador, coordinador o miembro DIE activo puede incorporar un
   miembro ordinario. Sólo un administrador puede conceder o retirar coordinación.
   Administradores y coordinadores pueden retirar miembros ordinarios; sólo un
   administrador puede retirar coordinadores.
4. El navegador selecciona un `Teacher` académico del tenant. El servidor obtiene
   su `identityUserId` ya vinculado y pide a Identity confirmar la membresía exacta,
   activa y perteneciente al tenant. El cliente no puede afirmar tenant, roles ni
   elegibilidad. Incorporar al DIE no modifica roles o memberships en Identity.
5. Al retirar un miembro, sus acciones abiertas deben reasignarse en la misma
   transacción a otro miembro habilitado. Las acciones cerradas y toda autoría
   histórica conservan la identidad original. La pérdida de membership del tenant
   bloquea el acceso inmediatamente por la verificación en línea, aunque la fila
   DIE se conserva como historia.
6. Cada reanudación crea un nuevo episodio de acompañamiento. Un índice único
   parcial permite sólo un episodio activo por alumno y tenant. Finalizar no borra
   episodios, registros ni acciones anteriores.
7. Cada hecho de bitácora captura los identificadores y etiquetas del año/curso
   vigentes en ese momento. Los cambios posteriores de matrícula no reescriben el
   contexto histórico.
8. Un registro conserva autoría y creación originales. Las correcciones agregan
   una revisión inmutable con autor de la corrección y motivo cuando corresponde;
   no sobrescriben revisiones. La anulación es un estado trazable, no un borrado.
9. La fecha del hecho se almacena como `date`. La hora, cuando se conoce, se
   almacena como minutos desde medianoche junto con el indicador aproximado y la
   zona IANA usada. No se sintetiza medianoche ni otra hora. La fuente se clasifica
   como presenciada o informada por terceros; en este último caso se exige una
   descripción no sensible de la fuente, no una cuenta Identity.
10. Los adjuntos DIE reutilizan blobs privados, cuota de 25 MB, deduplicación sólo
    dentro del tenant, validación de firma y escaneo fail-closed. Se admiten PDF,
    DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, JPG/JPEG, PNG y WEBP; ZIP queda excluido de
    DIE aunque el subsistema general lo soporte. Cada intento, referencia, listado
    y descarga exige autorización DIE; un permiso académico general no basta.
11. El PDF se genera bajo autorización DIE, aplica los filtros de consulta,
    referencia adjuntos sin incrustarlos y registra evidencia durable de la
    exportación. Sus respuestas y descargas usan `private, no-store`.
12. Datos DIE, descripciones, resultados, nombres de archivo y contenido no se
    escriben en logs, telemetría ni mensajes de error. Los eventos de auditoría
    guardan sólo identificadores opacos, acción, actor, tenant, correlación y
    metadatos categóricos mínimos.

## Consecuencias

- Identity necesita una operación interna, exacta y no enumerativa para confirmar
  la membresía activa de un target derivado por Académico. Esa operación no lista
  usuarios, no devuelve PII y no concede permisos.
- Las tablas DIE usan claves compuestas o predicados con `tenant_id`; la migración
  añade índices parciales para exclusividad activa que Prisma no expresa.
- La disponibilidad de Identity es requisito para leer o mutar DIE. Es una decisión
  deliberada de seguridad para este conjunto sensible.
- El nombre institucional del PDF usa la configuración de presentación ya
  autenticada por la UI; el API identifica el tenant por su UUID canónico hasta que
  exista un contrato de nombre institucional en Académico.

## Fuera de alcance y decisiones pendientes

- No se define borrado definitivo, conservación permanente, legal hold ni purga.
  Rige la conservación del piloto existente y no habrá UI/API de hard delete.
- No se crean diagnósticos automáticos, perfiles de riesgo, notas privadas,
  notificaciones, planes complejos ni tareas recurrentes.
- Una configuración general de zona horaria/nombre por tenant sigue siendo una
  decisión transversal futura. DIE conserva explícitamente la zona usada y parte
  con la configuración operacional vigente `America/Santiago`.

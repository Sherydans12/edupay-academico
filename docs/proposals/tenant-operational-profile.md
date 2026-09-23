# Perfil operativo tenant-scoped para documentos y fechas

Fecha de decisión técnica: 2026-09-23

Estado: aprobado para implementación en Académico por el alcance DIE. Este documento define el contrato y la migración antes de modificar el esquema o la API.

## Límites de dominio

Identity conserva la identidad canónica del tenant, las cuentas, sesiones y memberships. Académico incorpora un perfil operativo 1:1, identificado exclusivamente por el `tenantId` del contexto autenticado. El perfil no expone ni acepta un `tenantId` editable y no reemplaza el registro canónico de Identity.

Campos:

- `institutionDisplayName`: nombre institucional que puede imprimirse en documentos académicos;
- `timeZone`: identificador IANA usado para interpretar hechos con hora y calcular el día civil del tenant.

No se crean valores por defecto ni se copian datos productivos. La ausencia de fila equivale a ambos campos sin configurar.

## Contrato HTTP

`GET /api/v1/tenant/operational-profile`

- requiere contexto tenant autenticado;
- devuelve sólo el perfil del tenant del principal;
- incluye `institutionDisplayName`, `timeZone`, `version`, `updatedAt`, `complete` y `missingFields`;
- nunca acepta un tenant por parámetro.

`PATCH /api/v1/tenant/operational-profile`

- exige `TENANT_ADMIN` y revalidación vigente en Identity;
- acepta un subconjunto de `institutionDisplayName` y `timeZone`, más `expectedVersion` para control optimista;
- valida un nombre no vacío y una zona IANA canónica; `null` elimina explícitamente el valor;
- no acepta IDs ni roles y no modifica Identity;
- escribe el perfil y una revisión durable en una única transacción serializable.

La respuesta incompleta permite que la interfaz muestre una acción visible «Configurar perfil institucional». La exportación PDF falla con `409 TENANT_OPERATIONAL_PROFILE_INCOMPLETE` si falta el nombre institucional; nunca imprime el UUID del tenant como si fuera el colegio.

## Migración expand-only

Se agregan:

- `tenant_operational_profiles`, clave primaria y foránea `tenant_id`, campos nullable, versión y autor de la última modificación;
- `tenant_operational_profile_revisions`, historial append-only con snapshot, actor, membership, request ID y fecha.

No se actualizan las filas existentes, el ledger financiero ni los objetos de almacenamiento. El binario anterior ignora estas tablas.

## Semántica temporal

- fecha sin hora: se conserva como `date`; `eventTimeZone` permanece `null` y la falta de perfil horario no bloquea el registro;
- hecho con hora nuevo: el backend exige `timeZone` configurada y guarda una copia de esa zona en la revisión. No acepta una zona enviada por el navegador;
- corrección que no cambia la hora: conserva la zona histórica de la revisión anterior aunque el perfil haya cambiado;
- corrección que agrega o cambia la hora: captura la zona vigente del perfil; quitar la hora elimina la zona;
- cada revisión mantiene su snapshot, por lo que un cambio de perfil no reinterpreta hechos anteriores;
- «hoy» y la condición de vencida se calculan con la zona vigente del tenant. Si falta, la API no inventa UTC/host: `overdue` es `null` y el filtro `overdue=true` responde 409 con acción de configuración;
- filtros de fechas del hecho comparan fechas civiles almacenadas, inclusivas, sin convertirlas mediante la zona del servidor o navegador;
- valores iniciales «hoy» en la UI sólo se ofrecen cuando el perfil tiene zona; de lo contrario el campo queda sin valor y se muestra la acción de configuración.

## Auditoría y datos sensibles

El historial guarda snapshots del nombre y zona, IDs opacos del actor y correlación. No guarda bitácoras DIE, descripciones, nombres de alumnos ni contenido de archivos. Los errores de validación identifican el campo, no repiten el valor recibido.

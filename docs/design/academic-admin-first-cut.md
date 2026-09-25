# Administración académica: primer corte

## Revisión breve

La Administración ya reunía el resumen de preparación, la estructura académica, personas y relaciones; sin embargo, la navegación entre áreas no llevaba directamente a sus tareas. En Estructura, la guía de preparación y el avance de asignaturas ocupaban el espacio anterior a los formularios y tablas. En Personas, los formularios de incorporación competían con la búsqueda y el listado. Configuración institucional era un placeholder, aunque la API ya expone un perfil operativo acotado.

La dirección elegida conserva el shell y los tokens EduPay introducidos con DIE: contexto institucional visible, páginas enfocadas en el trabajo, controles nativos y accesibles, y resúmenes secundarios plegables. El estado `READY` mantiene su alcance original: evalúa únicamente un año activo y cursos activos; no representa asignaturas, personas ni matrículas.

## Implementación

- El resumen ahora enlaza directamente a Estructura, Personas y Configuración institucional. Las métricas de sincronización y almacenamiento quedan bajo un disclosure secundario.
- Estructura usa un contexto visible de año y curso y pestañas operables con flechas, Inicio y Fin. La preparación base conserva todo su contenido, pero comienza resumida; el seguimiento de asignaturas queda con las asociaciones de curso que describe.
- Los formularios manuales de alumnos y profesores se abren cuando se solicitan. La búsqueda mantiene el listado vigente ante un error, ignora respuestas antiguas y distingue carga de error. La paginación por cursor continúa completa y muestra fallos de carga.
- Años cerrados o archivados no se ofrecen para crear cursos; los cursos en años no activos permanecen en solo lectura. El cambio de tenant remonta las vistas y evita mezclar estado local entre membresías.
- El roster y las responsabilidades asignadas diferencian un error de carga de una lista vacía y ofrecen reintento.
- Configuración institucional permite leer el perfil existente y, sólo para `TENANT_ADMIN`, guardar el nombre usado en documentos y la zona horaria IANA con `expectedVersion`. Conserva el manejo de conflictos de versión.

No se cambiaron contratos, permisos backend, reglas de negocio, Identity, DIE, datos ni infraestructura.

## Alcance y límites

El endpoint institucional disponible sólo contempla nombre para documentos y zona horaria; no existe una API para personalizar marca o apariencia por tenant. Esta pantalla expone únicamente esos dos campos. La autorización backend sigue siendo la autoridad para lectura y escritura.

La lista de cuentas e invitaciones de Identity, asociaciones, matrículas, asignaciones directas, cambios de estado, paginación, y sus motivos/confirmaciones existentes se conservan. El indicador `READY` conserva el significado que ya tenía y se explica en pantalla.

## Capturas sintéticas

Las capturas comparan el build de `origin/main` con este corte. Se generaron en un preview local aislado con identidades y personas sintéticas, a 1440 × 900 (escritorio) y 480 × 844 (móvil); no se usó producción. La revisión interactiva también cubrió 390 px.

| Antes (`origin/main`)                                                        | Después (este corte)                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Administración — escritorio](screenshots/academic-admin-before-desktop.png) | [Administración — escritorio](screenshots/academic-admin-after-desktop.png) |
| [Estructura — móvil](screenshots/academic-admin-before-mobile.png)           | [Estructura — móvil](screenshots/academic-admin-after-mobile.png)           |

## Validación

Se revisaron resumen, estructura, personas y configuración con el cliente sintético; estados de lectura, vacío, carga y error; errores y reintento de roster/responsabilidades; cambio de membresía con respuestas tardías; y pestañas con flechas, Inicio y Fin. En navegador a 390 px, las fichas de personas y los campos institucionales se apilan, y las pestañas no desbordan. A 1440 px, contexto y acciones quedan visibles antes de los formularios.

Se comprobó la navegación móvil de Administración, Docencia y Estudiante con las sesiones locales sintéticas ya incluidas en el repositorio. Las páginas de rol reales no pudieron restaurar una sesión Identity en este entorno local; no se usaron credenciales ni se alteró la autenticación. El shell y sus enlaces no se modificaron.

Validaciones ejecutadas:

- `pnpm test`: correcto; web 146 pruebas aprobadas, API 208 aprobadas y 61 omitidas por la configuración de la suite.
- `pnpm --filter @edupay/web typecheck`: correcto.
- `pnpm lint`: correcto, sin errores; conserva 12 advertencias preexistentes en `course-builder` fuera de este corte.
- `pnpm build`: correcto para UI, contratos, API y web.

No se cambió schema, migración ni API. El único límite institucional confirmado es el contrato existente: nombre para documentos y zona horaria IANA; no se añadieron opciones sin soporte backend.

## Siguientes cortes

1. **Docencia**: priorizar revisión diaria, tareas pendientes y claridad del contexto curso/asignatura, con los patrones de navegación y estados compartidos.
2. **Estudiante**: optimizar en móvil el acceso a asignaturas, calendario y entregas, manteniendo visibles sus estados y fechas.
3. **Administración, segunda pasada**: observar uso real del nuevo patrón de estructura y personas; ampliar Configuración sólo si existe un contrato backend para nuevos datos institucionales.

# Primer corte de frontend académico: shell compartido y DIE

**Estado:** implementado en `feat/academic-die-frontend`, basado en
`origin/main` `473219410913627fb88d07b3d473cdecabebad30`. Sólo DIE recibió un
corte funcional; administración, docencia y estudiante conservan sus flujos.

## Diagnóstico

El shell mostraba una búsqueda global deshabilitada, contexto de un colegio
concreto y un aviso de sistema más prominente que la tarea. En DIE, la primera
persona se seleccionaba por defecto, la captura y todos sus campos opcionales
competían con la bitácora, y las versiones anteriores no se podían leer. En
móvil se cortaban las pestañas y la navegación inferior mezclaba cuatro rutas.
Los estados de las acciones internas también se mostraban como valores técnicos.

## Dirección e implementación

- **Shell compartido:** identidad EduPay neutra, tema `default`, institución y
  sección activa visibles, navegación agrupada por espacio de trabajo y módulo,
  aviso breve de datos reales o sintéticos, foco visible y navegación móvil
  limitada a las rutas principales del rol. Se retiraron el buscador sin función
  y las etiquetas de marca de un colegio de la metadata y los datos de demo.
- **Alumnos DIE:** selección explícita antes de abrir una hoja; búsqueda local y
  filtro por estado; incorporación plegable; ficha con curso y período, y
  acceso claro a su hoja de vida.
- **Hoja de vida:** contexto del alumno visible; datos principales primero y
  hora, lugar e intervención dentro de detalles desplegables; el origen de la
  información y su fuente obligatoria quedan junto a los campos principales;
  filtros conservados; descarga PDF explica cuándo falta el perfil institucional;
  autores legibles, fuente y lugar presentes; correcciones anteriores y sus
  motivos consultables; los motivos y la confirmación de anulación siguen siendo
  obligatorios; las adjunciones continúan usando descargas privadas del API.
- **Acciones y equipo:** estados en español; creación e incorporación plegables;
  reasignar ahora exige un motivo antes de confirmar; resultado, cancelación,
  retiro y responsabilidades mantienen sus campos y permisos actuales.
- **Contexto y datos:** las listas se actualizan conservando al alumno elegido
  dentro del mismo tenant. Al cambiar de membresía se limpian los registros y
  se invalida el contexto anterior antes de cargar la institución siguiente.

No encontré una limitación backend que impida este corte. La interfaz conserva
`AcademicApiClient`, las validaciones y autorizaciones del servidor, el tenant y
las membresías de Identity, la auditoría, las revisiones, los motivos, la
privacidad de adjuntos y los parámetros admitidos para exportar. No se tocaron
roles, contratos, esquema, autenticación permanente, flags, migraciones, BL,
Identity ni despliegues. El bypass de ruta y fixture usados para la revisión
sintética local se retiraron antes de la compilación final.

## Capturas sintéticas

Estas capturas documentan el estado anterior y usan exclusivamente personas,
institución y situaciones ficticias.

- [Antes · escritorio, lista DIE](screenshots/academic-before-desktop.png)
- [Antes · móvil, lista DIE](screenshots/academic-before-mobile.png)

La herramienta de ejecución bloqueó los dos intentos de iniciar el servidor
Next local con el resultado `blocked by policy`. Por eso no pude capturar el
estado posterior en navegador y dejo esa comparación visual pendiente; las
capturas anteriores no se presentan como un antes/después completo. La
validación de componentes y la compilación sí se ejecutaron sobre el código
final.

## Validación

- `pnpm --filter @edupay/web test`: **135 pruebas aprobadas** en 24 archivos.
- `pnpm --filter @edupay/web typecheck`: aprobado.
- `pnpm lint`: aprobado con 12 advertencias ya existentes en `course-builder`;
  sin errores ni advertencias en los archivos de este corte.
- `pnpm --filter @edupay/web build`: compilación de producción aprobada.
- Las pruebas nuevas cubren elección explícita, detalle opcional y fuente de
  terceros, lectura de revisiones, persistencia del contexto tras guardar,
  autorización visible del equipo y reasignación con motivo obligatorio.

## Siguientes cortes

1. **Administración:** revisar personas, estructura y configuración con tablas,
   filtros, paginación, permisos y estados de operación coherentes.
2. **Docencia:** priorizar acceso a cursos, preparación de contenido, revisiones,
   historial y adjuntos; comprobar tareas frecuentes desde móvil.
3. **Estudiante:** simplificar asignaturas, agenda, fechas próximas, contenido y
   entrega de trabajos con estados vacíos, confirmaciones y errores recuperables.

La dirección del shell es reutilizable, pero no se declara rediseñado Académico
completo hasta terminar y revisar esos cortes.

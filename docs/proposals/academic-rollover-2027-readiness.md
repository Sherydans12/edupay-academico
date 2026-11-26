# Preparación del avance 2026 → 2027

El 25 de noviembre de 2026 se revisó `main` de Académico en `6c6756d`. Este plan cubre el orden de trabajo para Administración y los criterios del ensayo con datos sintéticos.

## Qué existe en la base

| Flujo                          | Implementación y alcance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crear el año y preparar cursos | **Inicio → Preparar 2027** permite crear el año en borrador y revisar antes de copiar los cursos no archivados de 2026. La copia crea solo etiquetas de cursos en borrador. **Cursos → Nuevo curso** permite crear el primer **4.º medio** directamente en 2027. El equipo debe preparar sus asignaturas y profesores. [Administración por tarea](../design/academic-admin-by-task.md)                                                                                                                  |
| Avanzar por curso              | **Matrículas → Avance anual** permite elegir explícitamente el curso destino, previsualizar el padrón completo y marcar repitencia, cambio de curso o decisión pendiente por alumno. La confirmación exige una huella vigente, es idempotente y conserva el historial. Los registros del colegio traspasados a `MANUAL` son elegibles por las mismas reglas que el resto. [Primer corte](academic-course-promotion-first-cut.md) · [Evidencia del traspaso](../operations/edupay-authority-transfer.md) |
| Dar de baja una matrícula      | **Cursos → curso → Alumnos** permite dar de baja una matrícula en un año abierto. Es una baja efectiva inmediata que conserva la ficha y el historial. Si ya existe una matrícula 2027, aplica sobre esa matrícula para corregir el destino. [Modelo académico](../architecture/academic-model.md)                                                                                                                                                                                                      |
| Incorporar manualmente         | En el contexto 2027, **Matrículas → Incorporar** crea una ficha con RUN o IPE y su matrícula inicial. **Matricular** usa una ficha existente. La conciliación de RUN/IPE de fichas traspasadas sigue pendiente en el último ADR y es previa a abrir las admisiones del colegio, porque una ficha sin identificador puede duplicarse. [ADR-0024](../decisions/ADR-0024-academic-admission-and-student-identifier-proposal.md) · [ADR-0026](../decisions/ADR-0026-edupay-authority-transfer.md)           |

El cierre de frontend del 17 de noviembre registró Administración por año. El cierre del traspaso del 20 dejó pendiente la vista previa autenticada del avance con el padrón traspasado. En esta revisión el estado de producción se leyó de esos cierres. [Release del 17 de noviembre](../operations/year-context-admin-release-2026-11-17.md) · [Cierre del 20 de noviembre](../operations/edupay-authority-transfer.md)

## Vacíos que afectan el corte

1. **Confirmar ya cambia 2026.** Aun cuando 2027 y el curso destino estén en borrador, confirmar el avance inactiva de inmediato la matrícula de origen y abre la de destino. La baja de origen puede quitar el acceso derivado de esa matrícula a asignaturas vigentes. Si la proyección está habilitada, se encolan los cambios de origen y destino. La vista previa puede consultarse sin confirmar. El comando vigente requiere que **2026 y su curso de origen sigan activos**, así que el cierre formal de 2026 ocurre después de aplicar los avances. [Modelo académico](../architecture/academic-model.md) · [Contrato de proyección](../integration/academic-financial-projection.md)
2. **Falta distinguir «No continúa en 2027» de «Pendiente».** La excepción `DEFER` excluye al alumno de esa ejecución y deja su matrícula de 2026 activa, pero no registra una decisión durable de no continuidad. Una baja de 2026 se reserva para un retiro que deba hacerse efectivo hoy. Si el alumno termina 2026 y se va, debe conservar su acceso vigente hasta el corte y quedar sin alta en 2027.
3. **Falta evidencia del recorrido del colegio.** La estructura 2027, las secciones de destino y la ejecución del avance completo necesitan verificarse antes del corte. En Pagos queda por observar la primera incorporación real de punta a punta. La proyección mantiene separadas las matrículas de cada año y el operador de Pagos incorpora al alumno nuevo asignando un apoderado o aceptando un vínculo sugerido. [ADR-0025](../decisions/ADR-0025-data-authority-and-annual-cycle.md) · [Contrato de proyección](../integration/academic-financial-projection.md)
4. **Revisar alumnos ya matriculados en otro curso de 2027.** Académico evita duplicar una matrícula activa del mismo alumno en el mismo curso. Pagos trabaja con una matrícula por alumno y año. La preparación del avance debe mostrar los casos con un destino ya ocupado en otro curso del año para que el operador pueda resolverlos antes de confirmar. [Escritura de la proyección en Pagos](https://github.com/Sherydans12/BL-002-EduPay/blob/58b9d1d588918ec931726ce74ee85b8a07e82078/backend/docs/decisions/ADR-0027-academic-projection-write-mode.md)

## Orden propuesto de trabajo

1. **Preparar estructura y ensayar un curso primero.** Crear 2027 en borrador, revisar los cursos que se copiarían y crear **4.º medio**. Definir el destino de cada sección por su ID, empezando por **3.º medio 2026 → 4.º medio 2027**. Ensayar con alumnos sintéticos que avanzan, repiten, cambian de sección y no continúan. Verificar qué puede hacerse desde la vista previa con 2026 plenamente operativo.
2. **Implementar el borrador de avance en Administración.** Mostrar origen, destino, excepciones, pendientes y no continuidad. Permitir guardar y retomar la preparación durante varios días. Aplicar el avance con una confirmación explícita en la ventana de corte. La preparación conserva el acceso 2026 y el estado financiero hasta la aplicación.
3. **Ensayar la rutina de padrón 2027.** Probar por separado retiro efectivo de 2026, no continuidad en 2027 y baja de una matrícula de destino ya creada. Revisar los casos de fichas históricas sin RUN/IPE y preparar una conciliación por referencia estable con reporte de conflictos. Después, probar incorporación manual de alumnos nuevos y matrícula de alumnos con ficha existente en los demás cursos.
4. **Cierre académico y verificación con Pagos.** Revisar el mapa de secciones y los totales por curso. Una vez terminado el uso operativo de 2026, aplicar los avances con el año de origen todavía activo y comprobar los resultados. Verificar la activación de 2027, la lectura histórica de 2026 y la proyección por año en Pagos. Ejecutar el cierre formal de 2026 después de resolver los pendientes que dependan del avance.
5. **1.º básico al final.** Preparar su curso como parte de la estructura. Tratar el listado de alumnos nuevos en una entrega posterior, con identificadores conciliados y revisión de duplicados, sin usarlo en el ensayo técnico.

## Borrador de avance acordado para el siguiente corte

Administración necesita guardar el destino y las decisiones individuales desde ahora, retomar el trabajo en otra sesión y aplicar cuando termine el uso de 2026. El primer recorrido será **3.º medio 2026 → 4.º medio 2027**. La implementación del borrador queda para un corte de backend y frontend en Académico.

### Backend

- Diseñar persistencia para un borrador por tenant, curso de origen y año de destino. Guardar referencias a los cursos y matrículas, destino principal, excepciones, versión del borrador y huella del padrón. La escritura requiere la autorización de Administración del tenant.
- Distinguir avance, repitencia, cambio de curso, **No continúa** y **Pendiente**. Al aplicar, **No continúa** queda registrado sin crear matrícula 2027. El historial de 2026 se conserva bajo las reglas de cierre del año.
- Guardar o editar el borrador solo escribe el plan y su auditoría. Matrículas, acceso académico y outbox financiero conservan su estado. La versión permite detectar que otro administrador guardó cambios.
- La aplicación manual revalida permisos, versión, padrón y destinos, incluidos alumnos con otra matrícula 2027. Debe reutilizar la lógica transaccional e idempotente del avance. Si el padrón cambió, se conservan las decisiones guardadas y se exige revisar las diferencias antes de aplicar. Registrar el resultado y su recibo sin exponer identificadores personales en la auditoría.
- Documentar el contrato y la decisión de persistencia junto al comando existente. Definir en el diseño cómo se retomarán los casos pendientes después de aplicar el resto de un curso y cómo se registrará cada aplicación.

### Frontend

- Mantener el flujo en **Matrículas → Avance anual**. Mostrar claramente los años y cursos de origen y destino, si existe un borrador guardado y cuándo se guardó.
- Ofrecer **Guardar borrador**, **Retomar borrador** y **Aplicar avance**. La confirmación de aplicación muestra el efecto inmediato sobre las matrículas de origen de los alumnos que avanzan, el destino y el resumen de excepciones.
- Mantener las decisiones al paginar. Mostrar casos pendientes, no continuidad y conflictos de destino por separado. Si el padrón o el borrador cambiaron, mostrar qué debe revisarse antes de aplicar.

## Criterios de aceptación del primer ensayo integrado

- El curso nuevo de 4.º medio se puede crear en 2027 sin alterar el contenido ni las asignaturas de 3.º medio 2026.
- La vista previa muestra el destino y las excepciones. Si el padrón cambia, la confirmación exige recargar la vista previa.
- Un alumno ya inscrito en otra sección de 2027 se identifica antes del avance. El operador puede decidir cuál será su matrícula del año.
- Cuando solo se prepara o revisa, el alumno conserva su matrícula y acceso de 2026. Un alumno que no continúa termina sin matrícula 2027 y conserva su historial. Al aplicar un cambio se conserva el recibo y se evita el duplicado al repetir la confirmación.
- El alta manual crea una única matrícula en el curso 2027 elegido. Una ficha existente se reutiliza y un conflicto de RUN/IPE se entrega para revisión.
- Con la integración de prueba activa, los eventos llegan a la matrícula del año correcto en Pagos. El ejercicio deja intactos los cobros y pagos históricos de 2026.

## Verificación de esta revisión

- Pasaron 43 pruebas de Administración web en `academic-admin.spec.tsx`.
- Se aplicaron 15 migraciones desde cero en PostgreSQL 15 desechable. Pasaron 41 pruebas de API en `academic-domain.e2e-spec.ts`, `edupay-sync-consumer.e2e-spec.ts` y `academic-financial-projection.contract.e2e-spec.ts`. El caso de avance hacia cursos de 2027 en borrador confirma la inactivación inmediata de las matrículas de origen.
- El ensayo integrado con un padrón sintético de **3.º → 4.º medio** y un consumidor BL-002 queda como criterio del siguiente corte.

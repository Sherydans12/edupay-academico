# EduPay Académico — Manual de Administración Académica y Autogestión de Piloto

Este documento constituye la referencia operativa y técnica oficial para la administración académica por parte del rol `TENANT_ADMIN` en EduPay Académico, permitiendo configurar y operar pilotos escolares de forma autónoma desde la interfaz web, sin necesidad de acceso SSH, sentencias SQL manuales ni intervención de desarrolladores.

---

## 1. Principios de Arquitectura y Modelo de Seguridad

### 1.1 Aislamiento Multi-tenant y Contexto de Confianza
- **Multi-tenancy obligatorio**: Todas las peticiones, consultas a bases de datos, almacenamiento de archivos, sincronización y auditoría están estrictamente aisladas por `tenantId`.
- **Contexto derivado exclusivamente de JWT**: El `tenantId` nunca se recibe como parámetro de confianza desde el cliente web. La API académica valida la firma criptográfica del JWT emitido por EduPay Identity y extrae de sus claims el tenant y los roles activos.
- **Acceso denegado a roles no autorizados**: La capacidad `AdministerAcademicStructure` está restringida exclusivamente a usuarios con rol `TENANT_ADMIN` en el tenant respectivo. Peticiones de usuarios con rol `TEACHER`, `STUDENT` o de otros tenants son rechazadas con HTTP 403 Forbidden.

### 1.2 Límites de Propiedad de Datos (Data Ownership Boundaries)
Existe una delimitación estricta de propiedad de datos entre los tres sistemas del ecosistema:

1. **EduPay Central / Integración BL-002**:
   - Es autoritativo para los datos de filiación y matrícula del roster escolar: `firstName`, `lastName`, estado de matrícula financiera y pertenencia de curso inicial.
   - Estos campos están protegidos en Académico contra sobreescritura manual para evitar divergencias con el sistema central.
2. **EduPay Académico**:
   - Es autoritativo para la estructura pedagógica (años académicos, cursos, catálogo de asignaturas, espacios lectivos `CourseSubject`), asignaciones docentes, matrículas e inscripciones electivas, publicaciones de aprendizaje, entregas, calificaciones y cuotas de almacenamiento.
   - Almacena el correo de contacto local y el identificador de enlace `identityUserId`.
   - **Regla inquebrantable**: EduPay Académico **nunca** almacena contraseñas, hashes, secretos de autenticación ni tokens de refresco.
3. **EduPay Identity**:
   - Es autoritativo para la autenticación y el acceso: `institutionalUsername`, correo de identidad/login, membresías de tenant, roles (`TENANT_ADMIN`, `TEACHER`, `STUDENT`), invitaciones, desafíos de activación de un solo uso, credenciales y tokens de sesión.

---

## 2. Estructura Académica (`/administracion/estructura`)

La vista de Estructura Académica permite gestionar los cimientos organizativos del establecimiento escolar a través de tres pestañas principales:

### 2.1 Años y Cursos
1. **Años Académicos (`AcademicYear`)**:
   - Representa el año lectivo oficial (ej. `2026`).
   - Requiere nombre (`label`), fecha de inicio (`startDate`) y fecha de término (`endDate`).
   - Los años cerrados o archivados se conservan permanentemente para fines de auditoría e histórico académico; nunca se eliminan físicamente.
2. **Cursos (`Course`)**:
   - Representa un grupo/nivel escolar dentro de un año académico activo (ej. `7º Básico A`, `8º Básico B`).
   - Permite visualizar el **Roster de alumnos** inscritos en dicho curso en tiempo real.

### 2.2 Catálogo de Asignaturas (`Subject`)
- **Nomenclatura**: Utiliza la terminología oficial en español **"Asignatura"** (y no términos no aprobados).
- **Catálogo Institucional Reutilizable**: Define las asignaturas base que imparte el colegio (ej. *Lenguaje y Comunicación*, *Matemática*, *Ciencias Naturales*, *Historia y Geografía*).
- **Operaciones**:
  - **Crear asignatura**: Ingreso de nombre oficial.
  - **Renombrar**: Actualización del nombre oficial de la asignatura en el catálogo.
  - **Archivar**: Pasa la asignatura a estado `ARCHIVED`. Las asignaturas archivadas permanecen legibles en registros históricos pero no se ofrecen para nuevas aperturas de curso.

### 2.3 Asignaturas del Curso (`CourseSubject`)
- **Espacio lectivo concreto**: Vincula una asignatura del catálogo general a un curso específico en un año lectivo.
- **Configuración de espacio**:
  - **Asignación general del curso (`defaultForCourse`)**:
    - Si está habilitado (`true`), todos los alumnos matriculados en el curso cursarán esta asignatura de manera predeterminada.
    - Si está deshabilitado (`false`), la asignatura queda reservada para inscripciones directas o electivas individuales.
  - **Orden de presentación (`sortOrder`)**: Determina el orden visual en el que se listará la asignatura en las interfaces de estudiantes y docentes.
  - **Prevención de duplicados**: La interfaz y la API impiden asociar dos veces la misma asignatura activa al mismo curso.
  - **Archivado**: Permite archivar un espacio de asignatura sin destruir las entregas o calificaciones históricas ya registradas.
- **Gestión de Profesores Asignados (`CourseSubjectTeacher`)**:
  - Consulta en tiempo real los docentes asignados al espacio (`getAssignedTeachers`).
  - **Asignar profesor**: Permite seleccionar un profesor activo y vincularlo como docente responsable de la asignatura.
  - **Desasignar profesor**: Desactiva la asignación del docente de forma segura e inmediata (`deactivateTeacherAssignment`).

---

## 3. Personas, Identidad y Roster (`/administracion/personas`)

La administración de personas organiza a la comunidad escolar en tres secciones:

### 3.1 Alumnos y Flujo de Aprovisionamiento para Registros Sincronizados
1. **Diferenciación de Origen**:
   - **Gestionado por EduPay (`source = EDUPAY`)**:
     - Alumnos importados automáticamente mediante la sincronización.
     - Nombres y apellidos son autoritativos desde EduPay y están bloqueados contra edición manual.
     - Si el alumno no traía correo desde el sistema origen, el campo `email` en Académico se encuentra inicialmente vacío (`null`).
   - **Registro Manual (`source = MANUAL`)**:
     - Alumnos creados directamente por el administrador escolar. Nombres, apellidos y correo son plenamente editables antes del enlace.
2. **Flujo de "Crear Acceso" sin Duplicación de Fichas**:
   - Para entregar credenciales de inicio de sesión a un alumno sincronizado existente, el administrador hace clic en **"Crear acceso"** en su fila.
   - El sistema **no** crea un segundo alumno ni pide volver a registrarlo. La cantidad de filas de estudiantes en la base de datos es exactamente la misma antes y después del aprovisionamiento.
   - Se solicita el **Usuario institucional** (sugerido automáticamente) y el **Correo para invitación** (obligatorio en el flujo normal).
3. **Consistencia Criptográfica y de Datos del Correo**:
   - Al ejecutar "Crear acceso e invitar":
     1. El correo ingresado se normaliza (`trim().toLowerCase()`).
     2. Se actualiza el campo de contacto en Académico: `Academic Student.email = normalizedEmail`.
     3. Se aprovisiona la cuenta en Identity con el mismo correo: `Identity User.email = normalizedEmail`.
     4. Se vincula el identificador: `Academic Student.identityUserId = created.userId`.
     5. Identity envía la invitación oficial por correo para que el alumno elija su contraseña permanente.
4. **Seguridad contra Fallos Parciales y Reintentos Idempotentes**:
   - Si Identity crea la membresía pero la llamada de enlace a Académico falla temporalmente:
     - El diálogo pasa al estado transitorio **"Falta el vínculo académico"** mostrando los identificadores creados.
     - Al hacer clic en **"Reintentar vínculo académico"**, el sistema reintenta enlazar la membresía ya creada **sin generar una segunda cuenta en Identity**.
   - Si la actualización del correo en Académico se completa pero falla la llamada inicial a Identity:
     - El reintento posterior utiliza el correo ya registrado sin duplicar registros de estudiantes.
5. **Flujo Secundario Excepcional: "Activar sin correo"**:
   - Si un alumno no cuenta con correo institucional y se requiere enrolamiento presencial:
     - El administrador marca explícitamente la opción **"Activar sin correo (código de un solo uso)"**.
     - El botón pasa a **"Crear acceso con código"**.
     - Identity genera un código de activación numérico temporal.
     - Este código se muestra una sola vez en la interfaz para ser entregado en mano, **nunca se registra en logs ni almacenamiento persistente del navegador**, y no puede recuperarse tras cerrar el diálogo.
6. **Política de Modificación de Correo en Cuentas Vinculadas**:
   - Una vez que una cuenta cuenta con acceso vinculado (`identityUserId !== null`), **Identity pasa a ser la fuente autoritativa del correo de autenticación**.
   - En la interfaz de edición académica de alumnos y profesores, el campo de correo queda **bloqueado (read-only)** con la advertencia: *"Esta cuenta ya tiene acceso de Identity vinculado. El correo de inicio de sesión es gestionado autoritativamente por Identity y no puede modificarse de forma desacoplada desde Académico."*
   - Esto previene divergencias silenciosas donde un cambio en Académico deje de coincidir con el login de Identity.

### 3.2 Profesores
1. **Gestión Docente**:
   - Creación de nuevos profesores (nombres, apellidos, correo institucional).
   - Edición de datos personales (nombre y apellido editables; correo editable antes de vincular a Identity).
   - Activación y desactivación de docentes.
2. **Aprovisionamiento Docente**:
   - Creación de membresía con rol fijo `TEACHER` y vinculación inmediata al registro del profesor.
   - Entrega por correo o código de activación de un solo uso.

### 3.3 Inscripciones y Asignaciones
- **Inscribir alumno en curso**: Matricula a un estudiante en un curso completo, heredando automáticamente todas las asignaturas configuradas como `defaultForCourse = true`.
- **Asignar profesor a asignatura**: Asigna al docente responsable a un `CourseSubject` determinado.
- **Asignar asignatura directamente**: Inscribe a un estudiante específico en una asignatura individual (`directlyEnrollStudent`) para electivos o talleres.

---

## 4. Guía Operativa para el Despliegue del Primer Piloto Escolar

Siga esta lista de verificación paso a paso para configurar un nuevo establecimiento piloto:

### Paso 1: Configurar el Año Académico
1. Inicie sesión con credenciales de `TENANT_ADMIN`.
2. Navegue a **Estructura** (`/administracion/estructura`) -> Pestaña **Años y Cursos**.
3. Complete el formulario "Nuevo año académico" con el año correspondiente (ej. `2026`) y las fechas de inicio y término lectivo. Haga clic en **Crear año**.

### Paso 2: Registrar o Verificar los Cursos
1. En la misma pestaña, complete el formulario "Nuevo curso" seleccionando el año académico creado y el nombre del curso (ej. `7º Básico A`, `8º Básico B`).
2. Si el establecimiento cuenta con sincronización EduPay activa, verifique que los cursos sincronizados aparezcan en el selector de cursos.

### Paso 3: Configurar el Catálogo de Asignaturas
1. Vaya a la pestaña **Catálogo de Asignaturas**.
2. Cree las asignaturas del plan de estudio del establecimiento (ej. *Lenguaje y Comunicación*, *Matemática*, *Historia*, *Ciencias*, *Inglés*, *Artes*, *Educación Física*).
3. Si requiere corregir el nombre oficial de alguna asignatura, use la opción **Renombrar**.

### Paso 4: Habilitar Asignaturas en Cada Curso
1. Vaya a la pestaña **Asignaturas del Curso**.
2. Seleccione el curso a configurar en el selector desplegable.
3. Agregue cada asignatura del catálogo que corresponda a ese curso, asegurándose de marcar la casilla **"Asignación general para todos los alumnos del curso"** para asignaturas del tronco común.
4. Defina el orden de presentación deseado (`sortOrder`).

### Paso 5: Registrar Profesores y Asignar Asignaturas
1. Navegue a **Personas** (`/administracion/personas`) -> Pestaña **Profesores**.
2. Cree a los docentes del colegio indicando sus nombres, apellidos y correo institucional.
3. En cada docente registrado, haga clic en **Crear acceso** para habilitar su inicio de sesión en Identity.
4. Regrese a **Estructura** -> **Asignaturas del Curso** y asigne el profesor correspondiente a cada espacio de asignatura.

### Paso 6: Verificar Alumnos y Activar Accesos
1. Navegue a **Personas** -> Pestaña **Alumnos**.
2. Si los alumnos provienen de la sincronización EduPay, verifique la presencia del distintivo **"Gestionado por EduPay"**. No cree fichas duplicadas.
3. Para cada alumno que participará en el piloto, haga clic en **Crear acceso** para emitir su invitación por correo o su código de activación.
4. En caso de alumnos matriculados manualmente, verifique su inscripción en el curso desde la pestaña **Inscripciones y Asignaciones**.

---

## 5. Resolución de Problemas Frecuentes

| Situación | Causa | Solución |
| :--- | :--- | :--- |
| **Error 403 Forbidden** al ingresar a `/administracion` | La sesión activa no cuenta con el rol `TENANT_ADMIN` en el tenant actual. | Inicie sesión con la cuenta de administrador institucional aprobada para el tenant. |
| **No se pueden editar los nombres de un alumno** | El alumno tiene origen `source = EDUPAY` (sincronizado). | Los datos de filiación provienen del sistema central de EduPay para evitar inconsistencias de matrícula. Si requiere actualizar el correo de contacto antes de crear acceso, use el botón "Crear acceso" o edite el correo en la ficha no vinculada. |
| **El correo no se puede editar en la ventana de edición** | La cuenta ya tiene acceso vinculado con Identity (`identityUserId`). | Identity es autoritativo para el correo de login de cuentas vinculadas. Las modificaciones de correo se gestionan a través de los mecanismos de Identity. |
| **La asignatura no aparece en la lista de alumnos** | El espacio de asignatura tiene `defaultForCourse = false` y no se ha realizado inscripción directa. | Modifique la configuración del espacio en *Asignaturas del Curso* para marcarla como general del curso, o asigne al estudiante directamente en *Inscripciones y Asignaciones*. |
| **Error al agregar asignatura al curso** | La asignatura ya se encuentra activa en ese mismo curso. | Verifique la lista de asignaturas asignadas; no se permiten duplicados activos de la misma asignatura en un curso. |

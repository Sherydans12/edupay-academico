# Dirección Visual Oficial de EduPay Académico

> **Estado:** Documento canónico aprobado.  
> **Referencia canónica inicial:** Pantalla principal de Docente ([`/docente`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/features/teacher-screens.tsx#L269)) y el shell de la aplicación ([`AppShell`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/app-shell.tsx)).  
> **Propósito:** Servir como guía y conjunto de principios de diseño para cualquier persona o agente que trabaje en las vistas de **Profesor**, **Alumno**, **Administrador**, **DIE** y futuros módulos, asegurando coherencia visual sin rigidizar la evolución de la interfaz.

---

## 1. Visión y Atmósfera Visual

EduPay Académico es un entorno de trabajo diario para comunidades educativas (docentes, estudiantes, coordinadores y equipos psicopedagógicos). Su diseño busca transmitir:

- **Claridad pedagógica:** La información fluye de forma comprensible, accesible y serena.
- **Cercanía y calidez:** La interfaz da la bienvenida a personas, no a operadores de un sistema frío.
- **Colorido controlado:** Vivo y estimulante, sin caer en estridencias ni en una apariencia infantil.
- **Rigor profesional e institucional:** Confiable para colegios, con jerarquía visual estricta y tipografía cuidada.
- **Amplitud y respiración:** Espacios internos generosos, esquinas suaves y aire entre secciones.

### Lo que evitamos decididamente
- **Estética ERP tradicional:** Interfaces grises, pesadas, saturadas de cajas, tablas rígidas y formularios densos.
- **Corporativismo frío:** Fondos azul marino oscuro en toda la pantalla, bordes negros duros o sensación de software bancario de los años 2000.
- **Decoración superficial:** Elementos colocados solo para llenar espacio o métricas inventadas que no correspondan a datos reales del producto.

---

## 2. Filosofía y Sistema de Color

La regla fundamental de color en EduPay es: **Base ultra limpia + color focal con significado**.

### 2.1. Superficies y fondos base
- **Fondo general:** Ultra limpio y luminoso (`#f8fafc` o `#fcfbf8`), ofreciendo máxima legibilidad y descanso visual.
- **Tarjetas y paneles:** Blanco puro (`#ffffff`), con bordes suaves (`border: 1px solid #e2e8f0` o `rgba(226, 232, 240, 0.9)`) y elevaciones tenues (`box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03)`).
- **Prohibido teñir fondos completos:** No se deben oscurecer o teñir de colores intensos bloques estructurales enteros (como el sidebar o el fondo de página), ya que genera pesadez visual.

### 2.2. Paleta cromática implementada

| Rol / Contexto | Color Vivo | Contenedor Pastel | Borde Suave | Uso pedagógico |
| :--- | :--- | :--- | :--- | :--- |
| **Índigo Educativo** | `#4361ee` / `#3b82f6` | `#eff6ff` / `#eef2ff` | `#bfdbfe` / `#c7d2fe` | Asignaturas, navegación activa, botones primarios, identidad institucional. |
| **Ámbar de Atención** | `#f59e0b` / `#d97706` | `#fffbeb` / `#fef3c7` | `#fde68a` | Entregas por calificar, alertas, estados que requieren acción docente. |
| **Menta / Esmeralda** | `#10b981` / `#059669` | `#ecfdf5` / `#d1fae5` | `#a7f3d0` | Estados completados, conexión activa, bandeja al día, progreso positivo. |
| **Lavanda / Violeta** | `#8b5cf6` / `#7c3aed` | `#f5f3ff` / `#ede9fe` | `#ddd6fe` | Publicaciones agendadas, calendario, unidades curriculares y creatividad. |
| **Coral / Rosa Vencimiento** | `#e11d48` / `#f43f5e` | `#fff1f2` | `#fecdd3` | Fechas límite de entrega, avisos de vencimiento próximo. |
| **Texto y Neutros** | `#0f172a` (Títulos) / `#475569` (Cuerpo) | `#f1f5f9` (Pills/chips) | `#e2e8f0` | Tipografía principal, metadatos y divisores sutiles. |

---

## 3. Iconografía

La iconografía es uno de los pilares de la identidad de EduPay. Debe transmitir orden, precisión y amabilidad.

- **Componente canónico:** [`Icon`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/icons.tsx) en `apps/web/src/components/icons.tsx`.
- **Estándar geométrico:** Basado en la especificación **Lucide**:
  - Cuadrícula base: `viewBox="0 0 24 24"`.
  - Grosor de trazo uniforme: `strokeWidth="1.8"`.
  - Extremos redondeados: `strokeLinecap="round"` y `strokeLinejoin="round"`.
  - Renderizado vectorial SVG nativo puro (cero dependencias externas en tiempo de ejecución).
- **Chips pastel contenedores:**
  - Los iconos de métricas y navegación viven dentro de contenedores circulares o `rounded-xl` con fondos pastel (`.teacher-stat__icon--blue`, `.teacher-stat__icon--amber`, `.sidebar-link__icon`).
  - Al interactuar (`:hover`), el contenedor realiza una microinteracción sutil de escala (`transform: scale(1.05)` a `scale(1.08)`).
- **Reglas inquebrantables:**
  - ❌ **Prohibido usar emojis** como iconografía de funcionalidad en la interfaz.
  - ❌ **Prohibido mezclar estilos gráficos** (ej. iconos rellenos con iconos outline o estilos toscos de diferentes fuentes).

---

## 4. Ilustraciones y Recursos Gráficos

Las ilustraciones forman parte de la identidad de marca de EduPay Académico, aportando calidez y reduciendo la ansiedad ante tareas administrativas.

- **Componente canónico:** [`apps/web/src/components/educational-illustrations.tsx`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/educational-illustrations.tsx).
- **Recursos implementados:**
  - `TeacherHeroIllustration`: Composición educativa central para el banner de bienvenida (libro abierto 3D suave, birrete académico con borla dorada, libreta de verificación pedagógica y lápiz en perspectiva).
  - `EmptyTeacherSubjectsIllustration`: Portafolio amigable para estados vacíos de asignaturas.
  - `PriorityReviewIllustration`: Cuaderno con tareas y lápiz para atención prioritaria de entregas.
- **Criterios de aplicación:**
  - **Zonas estratégicas:** Banners de bienvenida, estados vacíos (`EmptyState`), procesos de incorporación (`onboarding`), bloques destacados y feedback de éxito.
  - **Uso moderado:** No saturar. La ilustración acompaña y ambienta, pero nunca debe competir con la lectura de los datos ni con las acciones del usuario.
  - **Vectores SVG escalables:** Siempre limpios, ligeros, con gradientes suaves y sombras ambientales tenues (`filter: drop-shadow`).
  - ❌ **Prohibido usar clipart**, imágenes bitmap pixeladas o ilustraciones de bancos genéricos con estilos incongruentes.

---

## 5. Componentes y Patrones de Interfaz

### 5.1. Shell y Navegación ([`AppShell`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/app-shell.tsx))
- **Sidebar luminoso:** Fondo blanco con borde derecho tenue (`#e2e8f0`).
- **Brand Lockup:**
  - Isotipo en gradiente índigo (`#4361ee` a `#3b82f6`) con icono de birrete académico (`graduation-cap`).
  - Nombre de la institución y badge contextual del módulo (ej. *"Portal Docente"*).
- **Enlaces de navegación:**
  - Cada link cuenta con un contenedor para su icono (`.sidebar-link__icon`).
  - Estado inactivo: neutro y limpio.
  - Estado activo (`[aria-current="page"]`): fondo índigo pastel (`#eef2ff`), texto índigo (`#4361ee`), icono vivo con sombra suave.
- **Perfil docente inferior:** Avatar con iniciales o fotografía real, nombre completo, rol (*"Docente"*) y punto de conexión institucional en verde esmeralda.
- **Barra de navegación móvil inferior (`.mobile-tabbar`):**
  - Fondo blanco translúcido (`backdrop-filter: blur(16px)`).
  - 4 accesos rápidos al alcance del pulgar (`Inicio`, `Asignaturas`, `Revisiones`, `Calendario`).
  - Altura cómoda y padding inferior con `env(safe-area-inset-bottom)`.

### 5.2. Hero Banner Pedagógico (`.teacher-hero`)
- Tarjeta amplia con gradiente muy suave (`linear-gradient(135deg, #ffffff 0%, #f4f7ff 55%, #faf5ff 100%)`).
- Badge contextual superior: pill redondeado con icono de destello (`sparkles`) y periodo escolar activo.
- Saludo personalizado: *"Buenos días, {Nombre}"* en tipografía semibold/bold accesible.
- Mensaje explicativo con datos dinámicos (conteo real de asignaturas y entregas).
- Botones de acción directa (primario y secundario).
- Ilustración integrada en el lateral derecho, adaptándose responsivamente en móviles después de los botones (`order: 2`).

### 5.3. Tarjetas de Estadísticas Vivas (KPI Cards) (`.teacher-stat-card`)
- Tarjetas con esquinas amplias (`rounded-2xl` / `18px`).
- Fila superior: Chip con icono en color pastel + Badge de estado (*"Requiere acción"* en ámbar / *"Al día"* en verde).
- Valor numérico grande (`1.95rem` en escritorio / `1.55rem` en móvil) con peso 800.
- Etiqueta descriptiva y microcopy contextual.
- Enlace inferior con flecha interactiva que avanza en `:hover` (`translateX(3px)`).
- Toda la tarjeta es clicable mediante `Link`.

### 5.4. Tarjetas de Asignatura (`.teacher-subject-card`)
- Franja superior decorativa delgada (`height: 0.35rem`) con degradado temático según la materia (azul, turquesa, púrpura, ámbar).
- Fila de metadatos: Código de materia en chip suave (ej. `LEN`) + Badge de curso (`7º Básico A`).
- Título de materia destacado en tipografía legible.
- Fila de chips de estado: número real de unidades didácticas y contenidos activos.
- Pie de tarjeta con affordance claro: *"Gestionar asignatura →"*.

### 5.5. Paneles de Atención Prioritaria y Próximos Plazos
- **Tarjeta de atención prioritaria:** Cambia de personalidad cromática dinámicamente:
  - Si hay entregas pendientes: fondo ámbar pastel suave (`#fffbeb`), badge de alerta y botón de corrección destacado.
  - Si todo está corregido: fondo menta pastel suave (`#ecfdf5`), icono de verificación y felicitación de bandeja al día.
- **Agenda de plazos:** Feed ordenado con chips distintivos según el hito (*"Vence entrega"* en coral / *"Publicación"* en azul), fecha formateada en español y título con límite de 2 líneas en móviles.

### 5.6. Patrón Universal de Asequibilidad de Desplazamiento Horizontal (`Scroll Affordance`)
- **Problema resuelto:** En dispositivos móviles, las barras de pestañas con múltiples opciones (ej. *"Todas"*, *"Entregas"*, *"Evaluaciones"*, *"Actividades"*, *"Publicaciones"*, *"Unidades"*) o *"Ruta y contenido"*, *"Entregas"*, *"Colaboradores"* suelen recortarse sin que el usuario advierta que puede deslizar.
- **Componentes canónicos:** [`ScrollableTabsBar`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/scrollable-tabs-bar.tsx) y [`Tabs`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/packages/ui/src/interactive.tsx).
- **Mecanismos integrados:**
  - **Indicador animado "Desliza" (`.scroll-affordance-cue`):** Pill interactivo con icono de flecha pulsante que informa al usuario que existe más contenido. Al hacer clic o al deslizar por primera vez, se desvanece suavemente.
  - **Máscaras de gradiente:** Bordes con degradado blanco (`.scroll-affordance--has-left`, `.scroll-affordance--has-right`) que indican sutilmente continuidad de contenido.
  - **Botones de flecha accesibles:** Controles táctiles en los extremos para desplazar el carrusel en incrementos de 180px con animación suave.
  - **Detección reactiva:** `ResizeObserver` y listeners pasivos de scroll para recalcular la visibilidad de los controles al redimensionar la ventana o rotar el dispositivo.

### 5.7. Doble Acceso Canónico a Perfil y Configuración
Para evitar saturar la barra de navegación lateral con enlaces redundantes, se define estrictamente el patrón de **doble acceso**:
1. **Acceso 1 (Sidebar - Identidad inferior):** Botones de acción rápida dentro de la tarjeta de usuario (`.sidebar-user__quick-btn`: *"Mi perfil"* y *"Ajustes"*). Cuentan con reseteo explícito de contraste (`color: #0f172a`), icono índigo `#4361ee` y elevación en hover.
2. **Acceso 2 (Topbar - Menú superior):** Píldoras de acceso rápido y menú desplegable de cuenta accesible mediante el avatar táctil.
- ❌ **Prohibido:** Colocar *"Mi perfil"* y *"Configuración"* como ítems sueltos dentro del listado principal de módulos docentes.

### 5.8. Centro de Notificaciones Pedagógico (`NotificationCenter`)
- Pestañas de filtrado contextual: *"Todas"* y *"Sin leer"*.
- Indicador numérico de alertas con pulso sutil ámbar cuando hay requerimientos urgentes.
- Acción de marcado individual en un toque (*"Marcar como leída"*) sin recargar ni redirigir.
- Estado vacío amigable ilustrado cuando la bandeja está al día.

### 5.9. Espacio de Revisiones y Calificaciones de Alta Densidad
- **Modos de cola:** Cola unificada global de todas las asignaturas o agrupada curso por curso.
- **Paginación y búsqueda rápida:** Manejo ágil de grandes volúmenes de alumnos con filtro en tiempo real por nombre de estudiante o título de la tarea.
- **Modal de corrección asistida:**
  - Validación numérica con escala oficial chilena (1.0 a 7.0).
  - Selector de frases pedagógicas rápidas (macros de retroalimentación constructiva).
  - Alerta y distintivo visual prioritario para estudiantes del programa de inclusión educativa (**DIE**), exponiendo adaptaciones curriculares sugeridas.
  - Acción *"Guardar y siguiente entrega"* para corrección en lote de alta velocidad.

### 5.10. Ficha Docente (`/docente/perfil`) y Preferencias (`/docente/configuracion`)
- **Perfil:** Horarios de atención presencial y virtual (con enlaces Meet integrados), carga lectiva activa con matrículas reales y gestión de seguridad/2FA.
- **Configuración:** Modo de *"Desconexión Digital"* (silencia alertas docentes fuera de la jornada laboral), preferencias de densidad de pantalla y soporte de accesibilidad de alto contraste.

---

## 6. Espaciado, Composición y Tipografía

- **Tipografía canónica:** **Montserrat** (cargada en el root layout mediante variable CSS `--font-montserrat`). Ligeramente redondeada, moderna, amigable y muy legible.
- **Whitespace y respiración:**
  - Márgenes internos generosos: `1.25rem` a `1.5rem` en tarjetas de contenido.
  - Espaciado entre bloques: `1.5rem` a `1.85rem`.
- **Estructura a 2 Columnas en Escritorio (`.teacher-main-grid`):**
  - **Columna principal (aprox. 65% / 1.55fr):** Espacio central de trabajo (Asignaturas, unidades, contenidos).
  - **Columna lateral (aprox. 35% / 0.85fr):** Atención prioritaria, agenda, vencimientos y contexto.
- **Flexibilidad en pantallas densas:** En vistas administrativas masivas o tablas complejas de calificaciones, se permite mayor densidad funcional compactando paddings, pero conservando los mismos tokens de color, esquinas redondeadas y tipografía.

---

## 7. Microinteracciones y Estados de Componentes

Las microinteracciones son parte intrínseca del diseño, no añadidos posteriores:

- **Tiempos de animación:** Rápidas y naturales: `160ms` a `200ms` con curva suave `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Hover en tarjetas:** Elevación suave de `translateY(-3px)` con expansión sutil de la sombra ambiental (`box-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.08)`).
- **Hover en botones:** Realce de color y micro-elevación de `translateY(-2px)`.
- **Focus visible:** Anillo de foco accesible en tono índigo/ámbar suave (`box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.35)`).
- **Active / Touch feedback:** Ligera compresión al presionar en pantallas táctiles.
- **Estados vacíos (`EmptyState`):** Con ilustración temática propia, mensaje constructivo y acción sugerida.

---

## 8. Principios de Responsividad (Mobile First Real)

La responsividad en EduPay Académico **no consiste en encoger la pantalla de escritorio**, sino en reorganizar intencionalmente la información para cada factor de forma:

| Breakpoint | Ancho | Comportamiento del Layout |
| :--- | :--- | :--- |
| **Desktop amplio** | `> 1200px` | 2 columnas balanceadas (contenido curricular + panel contextual lateral). Stats en 4 columnas. |
| **Tablet horizontal** | `900px - 1200px` | Panel principal y lateral en 1 columna apilada. Stats en grid 2×2. |
| **Tablet vertical** | `640px - 900px` | Sidebar colapsado en menú deslizable accesible. Ilustración se reposiciona bajo los textos. |
| **Móvil estándar** | `< 640px` | Botones de acción a ancho completo (`width: 100%`, touch target `≥ 48px`). Stats en 2×2 sin textos redundantes. Barra inferior fija (`mobile-tabbar`) con 4 pestañas accesibles al pulgar. `padding-bottom: 6.5rem` de resguardo. |
| **Móvil ultra angosto** | `< 360px` | Stats pasan a lista horizontal compacta de una columna. Títulos permiten salto de línea controlado sin desbordamiento. |

---

## 9. Datos Reales antes que Decoración

**Principio inquebrantable de EduPay Académico:**
No se introducen métricas ficticias, gráficos de anillo simulados, notas inventadas o porcentajes artificiales solo para que una maqueta se vea "más llena".

- La interfaz debe adaptarse fielmente a la información provista por el backend y los contratos de datos (`@edupay/contracts` y `AcademicApiClient`).
- Si una métrica no existe en el modelo de datos, **no se dibuja**.
- Si un docente tiene 1 sola asignatura asignada, la interfaz la presenta con dignidad visual sin necesidad de inventar 5 asignaturas falsas.
- Si no hay elementos o entregas, se utiliza un estado vacío ilustrado y guiado (`EmptyTeacherSubjectsIllustration`), nunca números artificiales.

---

## 10. Adaptabilidad por Módulo

Aunque toda la plataforma comparte la misma base identitaria, la composición de pantalla se adapta al propósito funcional de cada rol:

- **👨‍🏫 Profesor (`/docente` - Referencia Canónica):** Enfoque en gestión de contenidos curriculares, revisión ágil de entregas de estudiantes y control del calendario de publicaciones.
- **🎓 Alumno (`/estudiante`):** Enfoque en su próxima tarea a entregar, materiales de estudio por asignatura, retroalimentación recibida y calificaciones obtenidas.
- **👑 Administrador (`/administracion`):** Enfoque en estructura del colegio (años, cursos, materias), asignación docente, nómina de estudiantes y configuración. Mayor densidad funcional permitida.
- **🤝 Inclusión Educativa (`/die`):** Enfoque en fichas de seguimiento personalizado, bitácoras confidenciales, acuerdos pedagógicos y líneas de tiempo de intervención.

---

## 11. Anti-Patrones a Evitar

1. ❌ **Usar emojis en la interfaz gráfica** en lugar de componentes SVG formales.
2. ❌ **Cards genéricas grises** sin strip de acento, sin jerarquía interna ni intención de diseño.
3. ❌ **Bordes oscuros o sombras agresivas** que hagan lucir la interfaz tosca o sucia.
4. ❌ **Teñir fondos completos de colores oscuros** (como sidebars o bloques enteros que ahogan el contenido).
5. ❌ **Saturar cada rincón con ilustraciones:** las ilustraciones deben usarse con moderación en puntos clave.
6. ❌ **Convertir todo en tablas planas:** donde una tarjeta o fila estructurada aporte mejor lectura, preferir tarjetas.
7. ❌ **Compactar excesivamente** cuando hay espacio para respirar.
8. ❌ **Inventar datos o métricas** para complacer una referencia estética.
9. ❌ **Copiar ciegamente otras plataformas:** EduPay tiene su propia voz y propósito educativo.

---

## 12. Checklist de Verificación para Nuevas Pantallas

Antes de considerar terminada una pantalla en cualquier módulo de EduPay Académico, valida los siguientes puntos:

- [ ] **¿Se siente como EduPay?** (Fondo limpio, esquinas redondeadas suaves, ambiente luminoso y pedagógico).
- [ ] **¿La iconografía es consistente?** (Usa el componente `Icon` con especificación formal, sin emojis y con chips pastel cuando aplica).
- [ ] **¿El color tiene propósito?** (Acentos en botones, badges e iconos; sin teñir fondos estructurales completos).
- [ ] **¿Usa datos reales exclusivamente?** (Conectado a la API real, sin métricas ni porcentajes inventados).
- [ ] **¿Los estados están diseñados?** (Carga con Skeleton, error con Alert y reintento, estados vacíos con ilustración amigable).
- [ ] **¿Las microinteracciones están pulidas?** (Hover suave, elevación tenue, foco accesible).
- [ ] **¿Es 100% responsivo?** (Probado en móvil <640px, tablet y escritorio; touch targets ≥ 44px; sin desbordamiento horizontal).
- [ ] **¿Mantiene calidad visual equivalente a `/docente`?** (Respeto a la referencia canónica).

---

## 13. Referencias de Código en el Repositorio

- **Pantalla canónica:** [`apps/web/src/features/teacher-screens.tsx`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/features/teacher-screens.tsx#L269) (`TeacherDashboardScreen`).
- **Shell y navegación:** [`apps/web/src/components/app-shell.tsx`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/app-shell.tsx) (`AppShell`).
- **Librería de ilustraciones:** [`apps/web/src/components/educational-illustrations.tsx`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/educational-illustrations.tsx).
- **Sistema de iconos:** [`apps/web/src/components/icons.tsx`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/icons.tsx).
- **Estilos y reglas responsive:** [`apps/web/src/app/globals.css`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/app/globals.css#L7221) (Sección `TEACHER WORKSPACE`).
- **Primitivas de página:** [`apps/web/src/components/page-primitives.tsx`](file:///c:/Users/nicol/Documents/EduPayAcademico-worktrees/live-improvements/apps/web/src/components/page-primitives.tsx).

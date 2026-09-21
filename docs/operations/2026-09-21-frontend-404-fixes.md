# Corte frontend: favicon y roster docente

Fecha: 2026-09-21
Rama: `codex/frontend-academic-404-fixes`
Base: `origin/main` en `965c049a246676f21ae8a004817c0e956e7272c3`

## Hallazgos y cambio mínimo

- `/favicon.ico` no tenía asset ni declaración explícita en el layout. Se
  agregó un favicon ICO de 32×32 usando el marcador `CC` que ya utiliza el
  shell y los tokens de marca de Colegio Conquistadores (`#14234f` y
  `#e6b83f`). No se inventó un escudo: el producto documenta que todavía no
  existe un logo institucional aprobado.
- El enlace de `Ver estudiantes` en la vista docente de una asignatura apunta a
  `/docente/asignaturas/<courseSubjectId>/estudiantes`, pero ese segmento no
  existía. La intención es el roster docente, no una pantalla de administración.
  Se agregó el destino Next y una pantalla que reutiliza
  `getTeacherContextSubjects` + `getTeacherCourseSubjectRoster`, la misma
  funcionalidad autorizada que ya se usaba inline en `TeacherAcademicSubjectsScreen`.
- La pantalla primero valida que la asignatura esté en el contexto docente
  devuelto por el servidor. Si no está, no solicita el roster; si el API
  responde `401`/`403`, muestra el estado de sesión o autorización sin datos.
  No se cambiaron permisos, contratos ni endpoints.

## Aislamiento y solapamiento

El corte de administración de asignaturas tiene cambios locales en
`apps/web/src/features/course-builder/`, `apps/web/src/features/teacher-screens.tsx`
y `apps/web/src/features/academic-context-screens.tsx`. Este corte no edita esos
archivos: conserva el enlace existente y añade únicamente el segmento de
navegación faltante, una pantalla nueva, sus pruebas, el asset y esta nota.

## Evidencia ejecutada

- Pruebas focalizadas: 4/4, incluyendo sesión sintética docente autorizada,
  `403` sin estudiantes renderizados y asignatura fuera del contexto sin
  solicitud de roster.
- Suite completa: web 118/118 y API 208/208; 49 pruebas de API quedaron
  omitidas por la configuración existente de la suite.
- `pnpm db:validate`, `pnpm db:generate`, `pnpm typecheck` y `pnpm build`
  pasaron con la configuración pública sintética HTTPS que usa CI.
- `pnpm lint` pasó con 0 errores y 12 warnings preexistentes concentrados en
  `apps/web/src/features/course-builder/`, fuera de este corte.
- Servidor local: `GET
  /docente/asignaturas/00000000-0000-4000-8000-000000000001/estudiantes` →
  `200`, respuesta con el contenido de la pantalla de estudiantes; `HEAD
  /favicon.ico` → `200`, `image/x-icon`, 4670 bytes. El ICO decodifica como
  una imagen 32×32 de 32 bits.
- Los archivos modificados por este corte pasan Prettier. El `format:check`
  global continúa reportando 12 archivos preexistentes sin formato, que no se
  reformatearon para preservar el aislamiento.

No se fusiona, despliega ni modifica producción desde este corte.

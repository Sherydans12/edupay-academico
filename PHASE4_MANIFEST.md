# Phase 4 Manifest: Teacher Workspace Evolution

Este documento define la planificación estricta para la **Fase 4** del _Course Builder Evolution_, centrándose exclusivamente en la refactorización y arquitectura del frontend en `apps/web/src/features/teacher-screens.tsx` (específicamente, el componente monolítico actual `TeacherSubjectScreen`).

## 1. Árbol de Componentes a Extraer

El monolito actual será descompuesto en una jerarquía clara donde la memoización y el encapsulamiento de estado previenen los refrescos globales:

- **`CourseBuilder`**: El componente orquestador de nivel superior. Sustituye la lógica principal de `TeacherSubjectScreen`. Es el dueño de la obtención inicial de datos de la ruta y mantiene el estado optimista (vía un reducer local). Provee el contexto a sus hijos pero no renderiza cada nodo directamente.
- **`CourseOutline`**: Renderiza la lista general de Unidades (el esqueleto principal). Recibe el árbol optimista y coordina la renderización de las tarjetas.
- **`UnitCard`**: Renderiza una unidad individual, su cabecera y acciones.
  - **Propiedades clave**: Recibe datos estables de la Unidad, su `version` y su `orderRevision`.
  - **Comportamiento**: Memoizado. Renderiza la lista interna de ítems. Solo se re-renderiza si la Unidad misma o su `orderRevision` cambian.
- **`ItemRow`**: Renderiza una fila individual para un `LearningItem`.
  - **Propiedades clave**: Recibe los datos del Ítem (memoizados por ID), el `expectedItemVersion` y el `orderRevision` de su Unidad padre.
  - **Comportamiento**: Memoizado. Provee las acciones visuales (Mover Arriba, Mover Abajo, Mover a Unidad) y lanza los triggers de edición.
- **`ItemEditor`**: El formulario de edición encapsulado para un ítem, gestionado íntegramente mediante **React Hook Form**.
  - **Comportamiento**: Posee sus propias suscripciones (RHF). Gestiona el estado _dirty_ de manera aislada sin acoplar los pulsos de teclado al resto del árbol (outline).

## 2. Estrategia de Estado y Prevención de Refresh Global

El objetivo central de la Fase 4 es **eliminar el re-renderizado de toda la ruta tras mutaciones ordinarias** (ej. editar un ítem o moverlo).

- **Estado Optimista y Reducer**: `CourseBuilder` implementará un reducer (e.g., `useReducer` o estado derivado) que mantenga una proyección optimista de la lista. Cuando se emite un comando (como `MOVE_ITEM`), el reducer actualiza el DOM inmediatamente. Al recibir éxito del servidor (HTTP 200), se consolidan los nuevos `version` y `orderRevision` en la proyección, **sin invocar un refetch global**.
- **Refetch solo ante incertidumbre**: Un refetch completo o parcial de la ruta solo ocurrirá durante el montaje inicial, o como mecanismo de recuperación tras detectar una desincronización (ej. error 409 o un timeout de red).
- **Protección de Dirty State**: `ItemEditor` usará el flag `isDirty` de RHF para prevenir la pérdida de datos.
  - _Navegación Next.js / Cierre de Modal_: Se interceptará el evento de cierre y la navegación del cliente si `isDirty === true`, exigiendo confirmación explícita.
  - _Cierre de Pestaña_: Se inyectará un listener `beforeunload` nativo.
- **Feature Flag (Legacy Route)**: Los componentes extraídos coexistirán inicialmente. Un Feature Flag o una bifurcación controlada a nivel de página (ej. usando un parámetro de búsqueda `?v2=true` o variable de entorno en etapa de desarrollo) permitirá visualizar la ruta legacy frente al nuevo `CourseBuilder`, protegiendo la funcionalidad existente.

## 3. Especificación de Interfaces para Comandos (Fase 3)

La Fase 4 requiere que los clientes de API envíen el contexto de concurrencia y rastreo definido en la Fase 3. Los payloads deben extenderse para inyectar un **Idempotency-Key** (generado por el cliente en forma de UUID por cada intención de acción) y las revisiones esperadas.

```typescript
// Interface para mover un ítem entre o dentro de unidades
export interface MoveItemRequest {
  targetLearningUnitId: string;
  expectedItemVersion: number; // Versión base del ítem editado/movido
  sourceOrderRevision: number; // Revisión de orden de la unidad de origen
  targetOrderRevision: number; // Revisión de orden de la unidad de destino
  idempotencyKey: string; // UUID v4 generado en el frontend
  position?: number; // Posición sparse opcional
}

// Interface para guardar/actualizar un ítem
export interface UpdateLearningItemRequest {
  title?: string;
  // ... resto de campos del draft
  expectedItemVersion: number; // Evita sobreescribir si otro docente editó
  idempotencyKey: string;
}
```

### Flujo Exacto de Recuperación 409 `STALE_REVISION`

1.  **Emitir y Proyectar**: El usuario presiona "Mover abajo". El reducer aplica el cambio optimista en la UI y envía la solicitud `MOVE_ITEM` con los `orderRevision` actuales.
2.  **Conflicto**: El servidor responde con HTTP 409 `STALE_REVISION` (otro usuario alteró la lista).
3.  **Informar**: El frontend captura el error. El reducer emite una acción de `ROLLBACK` para el comando fallido usando su ID único, revirtiendo la tarjeta a su posición original.
4.  **Notificar**: Se muestra un banner/toast no bloqueante: "La estructura fue modificada por otro usuario. Se ha recargado la última versión."
5.  **Recargar**: Se ejecuta un `refetch` silencioso (background) de la ruta o de las unidades afectadas para sincronizar la vista con el estado del servidor.
6.  **Reaplicar (Manual)**: El frontend **NUNCA** reaplica el movimiento automáticamente. El usuario debe evaluar la nueva estructura visualmente y decidir si vuelve a ejecutar la acción.

## 4. Matriz de Pruebas Requeridas

- **Estado Dirty / Clean**:
  - Abrir `ItemEditor`, escribir en el título, e intentar recargar la página → _Debe mostrar advertencia del navegador._
  - Guardar el formulario, e intentar recargar → _Debe recargar sin advertencia._
  - Escribir en el editor, presionar botón "Atrás" de Next.js → _Debe interceptar y pedir confirmación._
- **Recuperación 409**:
  - Simular una respuesta 409 en el Mock de la API al intentar mover un ítem → _El ítem debe regresar a su posición original inmediatamente y disparar un refetch de la ruta, anunciando el conflicto al usuario._
- **Reorder Optimista**:
  - Presionar "Mover abajo" en el primer ítem → _El DOM debe actualizarse de inmediato sin esperar el roundtrip de red. La petición enviada debe incluir la `idempotencyKey` única._
- **Accesibilidad (a11y)**:
  - La navegación por teclado (Tab) debe alcanzar los botones de "Mover arriba", "Mover abajo" y "Mover a unidad" de cada `ItemRow`.
  - Tras completarse (o revertirse) un movimiento, el foco del teclado debe mantenerse de forma inteligente (ej. en el botón de la fila movida, o en la fila adyacente si desaparece), asegurando que el usuario no pierda el contexto hacia el `document.body`.

---

_Nota: Este manifiesto se adhiere a las restricciones de NO introducir Drag & Drop (DnD), NO alterar esquemas de BD, y NO contener código de los componentes funcionales, sirviendo únicamente como guía de arquitectura para la Fase 4._

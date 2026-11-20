# ADR-0026: traspaso de la autoridad EDUPAY a Académico

Estado: **Aceptado** (2026-11-20). Implementa ADR-0025 decisión 5 y ADR-0024
punto 5.3. Aceptarlo no autoriza la migración ni el traspaso en producción:
cada uno requiere autorización específica y el procedimiento de
[traspaso de autoridad](../operations/edupay-authority-transfer.md).

Relacionado: [ADR-0016](ADR-0016-edupay-sync-strategy-proposal.md),
[ADR-0024](ADR-0024-academic-admission-and-student-identifier-proposal.md),
[ADR-0025](ADR-0025-data-authority-and-annual-cycle.md) y
[contrato de proyección financiera](../integration/academic-financial-projection.md).

## Contexto

Lectura de producción del 2026-11-20 (solo lectura, agregados):

| Dato                                          | Valor                                                              |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Alumnos `EDUPAY`                              | 242 activos + 10 inactivos; ninguno con RUN/IPE en Académico       |
| Cursos `EDUPAY`                               | 13 en 2026                                                         |
| Matrículas `EDUPAY`                           | 242, todas activas en 2026                                         |
| Configuración del sync v1                     | habilitada; worker detenido; última ejecución manual el 2026-11-15 |
| Vínculo en Pagos (proyección, ADR-0027 de BL) | 242 alumnos y 12 cursos por id canónico                            |

El origen `EDUPAY` hace que Académico no edite esas fichas, que el avance
anual las marque como gestionadas por sincronización y que solo el sync v1 las
cambie. Con el sync detenido nadie puede corregirlas ni avanzarlas a 2027.
Además, un disparador de la base (`prevent_edupay_external_identity_mutation`,
migración `20260811190000_edupay_sync_consumer`) impide cambiar `source` o
`external_reference` de una fila `EDUPAY`.

## Decisión

1. **Un comando de una vez por tenant**,
   `pnpm sync:transfer-authority -- --tenant-id <uuid>`, que por defecto solo
   ensaya y reporta conteos y bloqueos. Aplica con `--apply` y los tres
   conteos confirmados del ensayo (`--expect-students`, `--expect-courses`,
   `--expect-enrollments`); si el padrón cambió, no aplica nada.
2. **En una transacción serializable:** toma la concesión del sync (si hay una
   ejecución en curso, no aplica), deshabilita la configuración del sync v1 y
   cambia alumnos, cursos y matrículas `EDUPAY` del tenant a `MANUAL`,
   **conservando `external_reference`**. Registra una auditoría de sistema
   `EDUPAY_AUTHORITY_TRANSFERRED` con los conteos. Repetirlo no cambia nada.
3. **Bloqueos del ensayo:** profesores `EDUPAY`, filas `EDUPAY` sin referencia,
   una fila `MANUAL` que ya use la misma referencia y una ejecución del sync en
   curso.
4. **El disparador se mantiene** y solo admite la transición `EDUPAY → MANUAL`
   con la misma referencia dentro de una transacción que fija
   `edupay.authority_transfer = 'on'` (`SET LOCAL`). Lo hace la migración
   `20261120120000_edupay_authority_transfer`, que solo reemplaza la función:
   no cambia tablas, índices ni datos.
5. **Marca de traspaso:** una ficha o curso `MANUAL` con `external_reference`.
   Académico no asigna referencias externas por otra vía. Con esa marca:
   - el sync v1 no vuelve a ejecutarse para el tenant
     (`SYNC_AUTHORITY_TRANSFERRED`) ni se puede rehabilitar con
     `sync:configure`, porque recrearía las fichas como `EDUPAY` duplicadas;
   - la proyección financiera envía `legacyIntegrationId` desde
     `external_reference` también después del traspaso, así que el payload no
     cambia y no se emiten eventos por el traspaso;
   - la web muestra el origen "Traspasado desde EduPay".

## Alternativas descartadas

- **Mantener `EDUPAY` y relajar las reglas por una bandera del tenant:** sin
  migración, pero deja un origen falso para siempre y reparte la condición por
  servicio, avance, roster y web.
- **Un origen nuevo (`ACADEMICO`):** obliga a cambiar todas las reglas que hoy
  distinguen `MANUAL` y no aporta información que no dé la referencia.
- **Deshabilitar el disparador durante la operación:** requiere DDL y bloqueo
  exclusivo en producción y deja la protección apagada si algo falla.

## Consecuencias

- El avance anual puede mover las 242 matrículas. Las fichas y cursos se
  editan en Académico; los cambios llegan a Pagos por la proyección.
- Las fichas traspasadas siguen sin RUN/IPE hasta la conciliación desde Pagos
  (ADR-0024 punto 5.2). Mientras tanto, admitir a un alumno actual con su RUN
  crearía otra ficha: esa conciliación debe ir antes de abrir admisiones 2027.
- Pagos aún permite editar alumnos y cursos. Desde el traspaso esos cambios no
  vuelven a Académico y una reproyección posterior los reemplaza; el retiro de
  esa edición en Pagos (ADR-0025 decisión 1) es el paso siguiente.
- Reversa: no hay comando inverso. El recovery point previo de la base de
  Académico es la vuelta atrás; volver a sincronizar desde EduPay no es un
  camino soportado.

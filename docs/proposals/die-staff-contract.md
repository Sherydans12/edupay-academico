# Contrato aprobado: especialistas no docentes en DIE

Estado: aprobado para implementación el 2026-09-23. No declara completo el flujo
hasta que pase Identity→Académico con `STAFF`.

- `STAFF` es tenant-scoped, administrado sólo por `TENANT_ADMIN` en Identity.
  No concede capacidades docentes, administrativas, financieras ni DIE.
- Académico autoriza al actor DIE y resuelve por coincidencia exacta de
  `institutionalUsername` vía S2S. Identity deriva el tenant del actor revalidado;
  el navegador no elige IDs Identity ni tenant.
- Elegibilidad: usuario, tenant y membership activos; `STAFF`, `TEACHER` o
  `TENANT_ADMIN`; ausencia de `STUDENT` y `GUARDIAN` en esa membership.
  Roles de otros tenants son irrelevantes y todas las negativas son indistinguibles.
- Se guardan `identityUserId` y `identityMembershipId` exactos. El username
  puede ser información personal y es sólo etiqueta capturada: no se registra en
  logs/auditoría ni autoriza. Cambiarlo no modifica la asignación ni su etiqueta.
  Las entradas nuevas capturan la etiqueta de la asignación y el PDF la conserva;
  admins sin asignación usan el ID opaco. Una membership nueva no hereda acceso.
- Sólo admin concede/retira coordinación. Admin o coordinador retira ordinarios;
  sólo admin retira coordinadores; no hay auto-retiro. Con acciones abiertas o
  acompañamientos activos se exige reemplazo DIE activo, elegible, del mismo tenant
  y la reasignación/retiro es transaccional. Sin responsabilidades no se exige.
- Revocación o pérdida de rol corta acceso aunque queden tareas.

Identity agrega resolución exacta y `STAFF`. Académico vuelve opcional `Teacher`,
agrega etiquetas capturadas y migra filas existentes sin cambiar IDs, acciones,
archivos ni ledger. No hay envío a BL ni borrado definitivo.

Con datos DIE no se recomienda rollback directo. Deben bloquearse en el borde
`GET /api/v1/files/:fileObjectId/download` y
`GET /api/v1/die/students/:studentId/export.pdf`, manteniendo storage privado,
hasta restaurar un binario que comprenda DIE. Un 404/500 accidental no es control.

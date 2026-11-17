# Administración por tarea y año en contexto — release 2026-11-17

Release de [PR #39](https://github.com/Sherydans12/edupay-academico/pull/39)
(merge `1d4498c8882454c7194fd58b54eb321c88a7ffa6`). Sin migraciones ni cambios
de variables. Diseño en
[academic-admin-by-task.md](../design/academic-admin-by-task.md); endpoints en
[academic-model.md](../architecture/academic-model.md).

## Imágenes publicadas

| Componente      | Workflow (run)                                                                                                         | Imagen                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Académico API   | Publish Academic API runtime ([44197931663](https://github.com/Sherydans12/edupay-academico/actions/runs/44197931663)) | `ghcr.io/sherydans12/edupay-academico@sha256:7625ab2230936487e70070a6f7871958bc2e750a921cf9048480204e48c7b3b4`                                                                |
| Académico FRONT | Publish Academic web image ([44197274958](https://github.com/Sherydans12/edupay-academico/actions/runs/44197274958))   | `ghcr.io/sherydans12/edupay-academico-web@sha256:5ceb5e634996378619e24b1f0120cc21ae5bd499428754e8b3c6fd1de9a7c1cb` (tags `main` y `1d4498c8882454c7194fd58b54eb321c88a7ffa6`) |

CI de `main` en `1d4498c`: correcto.

## Despliegue

El operador redeployó en Coolify, en este orden, el API
(`iobfkpujjoa2kj5urbpnjvzi`, imagen por digest) y luego el FRONT
(`cct0rtf5iku6fkd3t9hldnv4`, tag `main`), e informó ambos con éxito. El orden
importa: la web nueva envía `academicYearId` al listado de alumnos y el API
anterior lo rechazaba.

## Verificación observada (2026-11-17, sin sesión)

- `GET https://academico-api.edupay.baselogic.cl/api/v1/health/ready` → 200,
  `status: ready` (base de datos, almacenamiento y antivirus `ok`).
- `GET https://academico.edupay.baselogic.cl/api/health` → 200; `/login` → 200.
- `/administracion/matriculas` (ruta nueva) → 200, mientras una ruta inexistente
  → 404: el FRONT servido incluye este corte.
- `GET /api/v1/students?academicYearId=…` sin token → 401 (autorización
  intacta).

No verificado desde esta sesión: las pantallas con sesión de administración
(el operador informó la operación correcta) y que el API servido sea la imagen
`7625ab22…` más allá de su salud.

## Rollback

Sin cambios de esquema, por lo que basta volver a las imágenes anteriores:

- API: `ghcr.io/sherydans12/edupay-academico@sha256:23dff3c8c61051b5bb55236f109292c5e10d946aaae634248d86a6ff126880f7`
  (`bce2636`).
- FRONT: `ghcr.io/sherydans12/edupay-academico-web@sha256:0e6051236de6222d821be2e4dcf9045366c54b489388c2e04a60beba02b28d94`
  (tag `bce26361d145da21bf4f259a82032075e556ed71`).

Si se revierte el API, revertir también el FRONT (la web nueva requiere el API
nuevo).

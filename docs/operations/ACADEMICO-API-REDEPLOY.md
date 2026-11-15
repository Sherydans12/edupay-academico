# Publicar y redeplegar Académico API

El runtime de la API se publica manualmente desde GitHub Actions. El flujo usa
`GITHUB_TOKEN`, construye el `runtime` de `deploy/Dockerfile.api` para
`linux/amd64` y valida la imagen publicada por digest. No requiere Docker ni
credenciales GHCR en el computador del operador. Publicar la imagen no reinicia
Coolify.

## Publicar la imagen

1. En `Sherydans12/edupay-academico`, abre **Actions → Publish Academic API
   runtime → Run workflow**.
2. Selecciona `main` y ejecuta el workflow. Se rechazan ejecuciones desde otras
   ramas.
3. Cuando finalice correctamente, copia `ACADEMICO_API_IMAGE` desde **Summary**
   o el log final. La referencia tendrá este formato:

   ```text
   ghcr.io/sherydans12/edupay-academico@sha256:<digest>
   ```

El digest debe salir de `IMAGE_DIGEST`/`ACADEMICO_API_IMAGE`, no del digest de un
archivo `.dockerbuild` que aparezca en **Artifacts**.

## Redeploy

1. En Coolify, edita el recurso Académico API `iobfkpujjoa2kj5urbpnjvzi`.
2. Cambia su imagen por la referencia inmutable por digest entregada por el
   workflow y guarda.
3. Redeploya solo Académico API. No uses la imagen web ni el recurso migrador.
4. Comprueba que el servicio quede saludable y que
   `https://academico-api.edupay.baselogic.cl/api/v1/health/ready` responda.

Imagen API desplegada y verificada el 2026-11-15 (ver
[admission-release-2026-11-15.md](admission-release-2026-11-15.md)):
`ghcr.io/sherydans12/edupay-academico@sha256:c988b07a80a5e43363472045d06c795bbe329514b7d1ca9272152d5f49b7a4f8`,
desde `3a06df42783e470262bfa8179149b0a12d5a2d12`. Rollback: `sha256:5a6ae5e1…`.

La imagen del corte actual (avance anual, padrón a escala y admisión RUN/IPE de
ADR-0024) se publicó y verificó desde `main` en
`3a06df42783e470262bfa8179149b0a12d5a2d12` ([run 43731449591](https://github.com/Sherydans12/edupay-academico/actions/runs/43731449591)):

```text
ghcr.io/sherydans12/edupay-academico@sha256:c988b07a80a5e43363472045d06c795bbe329514b7d1ca9272152d5f49b7a4f8
```

**Esta imagen requiere aplicar antes la migración
`20261115120000_student_national_identifier`**: el API nuevo lee las columnas
`national_id_type` y `national_id`. Sigue
[ACADEMICO-MIGRATION-RUNNER.md](ACADEMICO-MIGRATION-RUNNER.md) y redeploya el API
solo después de verificar el ledger. La imagen `sha256:5a6ae5e1…` publicada
desde `3eca5e7` quedó superada: no incluye PR #31 ni #32 y no debe usarse para
este corte.

No uses el digest antiguo `sha256:b3e45d7c0afad1729947bdea6fe16d517c3dc9060891b38b313ce14a0548084a` encontrado en el worktree de publicación anterior: corresponde al SHA `b2f489f3bfbb67da8fc8ff71be7ea551e1de27c9` (2026-08-28), y el job independiente de verificación de esa publicación falló.

El avance anual no agregó migraciones; la admisión RUN/IPE sí. Para cualquier
cambio de esquema, seguir el gate de base de datos, el recovery point y la
autorización descritos en [RUNBOOK.md](RUNBOOK.md) y ejecutar el runner según
[ACADEMICO-MIGRATION-RUNNER.md](ACADEMICO-MIGRATION-RUNNER.md). El redeploy del
API nunca ejecuta migraciones por sí mismo.

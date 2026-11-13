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

La última imagen API documentada como desplegada sigue siendo
`ghcr.io/sherydans12/edupay-academico@sha256:50ef3a589234179a27c332adcd8a6b52b6be59532586688354056cc9089fe42d`, construida desde
`5e3e6079baf4b8f6732a3d4f270f27c67ffa812b`. La nueva imagen del corte actual ya
fue publicada y verificada desde `main` en `3eca5e71daf49166e3fdf9ccd58fd608368592b1`:

```text
ghcr.io/sherydans12/edupay-academico@sha256:5a6ae5e127797956c5718403fc58d83c28499e8ff7f2743f69751654f7da1056
```

El código de avance anual llegó a `main` en `6d15463376d75d9803325427ec388255a9458a70`; el commit `3eca5e7` agrega el publicador y documentación. El [workflow de publicación](https://github.com/Sherydans12/edupay-academico/actions/runs/43447773531) terminó correctamente. Esta imagen está publicada, pero sigue pendiente el redeploy manual en Coolify.

No uses el digest antiguo `sha256:b3e45d7c0afad1729947bdea6fe16d517c3dc9060891b38b313ce14a0548084a` encontrado en el worktree de publicación anterior: corresponde al SHA `b2f489f3bfbb67da8fc8ff71be7ea551e1de27c9` (2026-08-28), y el job independiente de verificación de esa publicación falló.

El cambio de avance anual no agregó una migración Prisma. Para cualquier cambio
futuro de esquema, seguir el gate de base de datos y la autorización descritos
en [PRODUCTION.md](PRODUCTION.md) y [RUNBOOK.md](RUNBOOK.md); no ejecutar el
migrador como parte de este redeploy.

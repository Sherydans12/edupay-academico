# Publicar y desplegar el FRONT Académico

## Configuración única ya realizada

La aplicación de Coolify `cct0rtf5iku6fkd3t9hldnv4` consume una imagen Docker
preconstruida de GHCR. Coolify no compila este repositorio. El workflow
[`Publish Academic web image`](../../.github/workflows/publish-academico-web.yml)
construye y publica el FRONT desde `main` cuando cambian los archivos de la
aplicación o sus dependencias.

- Coolify está configurado con la imagen `ghcr.io/sherydans12/edupay-academico-web`
  y tag `main`. No habilitar auto deploy.
- El paquete GHCR permanece **privado**. En **Manage Actions access**, el
  repositorio `Sherydans12/edupay-academico` tiene rol **Write**; el workflow
  utiliza su `GITHUB_TOKEN` con `packages: write`. Este permiso permite publicar
  la imagen y su metadata, sin dar acceso a otros repositorios.
- Los tags publicados son `main` (redeploy habitual) y el SHA completo del
  commit (inmutable, útil para rollback). `main` es un tag de imagen Docker; no
  es una rama Git.
- Esta configuración quedó verificada en el release
  [2026-10-09](teacher-frontend-release-2026-10-09.md).

## Flujo normal

1. Integra el cambio aprobado en `main`.
2. Espera a que `Publish Academic web image` termine correctamente. El workflow
   valida el commit, publica ambos tags, comprueba los labels OCI y ejecuta la
   imagen para probar `/api/health` y `/login` (incluida la ausencia de las
   cuentas de prueba del entorno local).
3. En Coolify, abre el recurso `edupay-academico-web-die-20260924` y pulsa
   **Redeploy**. Con el tag `main` ya configurado, no hay que copiar hashes ni
   editar el formulario de imagen en cada release.
4. En **Deployment Logs**, confirma `Success`/`Running` y el pull de la imagen.
   Verifica `https://academico.edupay.baselogic.cl/api/health` y `/login`.

Para cada release, el paso de Coolify es solo **Redeploy** después de que el
workflow de publicación haya terminado correctamente. La publicación se inicia
al integrar cambios de aplicación/dependencias en `main`; no se debe redeployar
mientras Actions siga construyendo o si la verificación falla.

El workflow solo publica imágenes; no llama a Coolify ni cambia producción. La
promoción sigue siendo manual y afecta únicamente al FRONT. API, Identity,
workers, datos, variables, dominios, puertos y healthcheck quedan fuera de este
flujo.

## Reintentar la publicación

Si hace falta volver a publicar el HEAD de `main` sin un nuevo cambio, ejecuta
**Actions → Publish Academic web image → Run workflow** y selecciona `main`.
Espera que termine correctamente antes de pulsar **Redeploy** en Coolify.

## Rollback

Conserva el tag inmutable del commit de cada release y el digest registrado en
Coolify. Para volver a una versión anterior, configura temporalmente el tag del
SHA completo aprobado (o el digest de la imagen retenida), guarda y redeploya.
Después de verificar el rollback, restaura el tag `main` para que los próximos
redeploys sigan la imagen más reciente publicada desde `main`.

## Requisitos de la imagen

- Dockerfile: `deploy/Dockerfile.web`.
- Plataforma: `linux/amd64`.
- Las únicas build args son las bases públicas versionadas de Académico API e
  Identity. No se pasan secretos al build.
- El workflow verifica los labels de procedencia, ejecuta el contenedor y prueba
  `/api/health` y `/login`; también comprueba que el login de producción no
  incluya las cuentas de prueba de desarrollo.
- El registry usa `GITHUB_TOKEN` de Actions con `packages: write` y el acceso
  Write del repositorio al paquete privado configurado arriba. No crear ni
  copiar tokens de registry a variables del workflow.

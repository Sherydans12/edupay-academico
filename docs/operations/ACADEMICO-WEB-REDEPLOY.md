# Publicar y desplegar el FRONT Académico

## Flujo normal

La aplicación de Coolify `cct0rtf5iku6fkd3t9hldnv4` consume una imagen Docker
preconstruida de GHCR. Coolify no compila este repositorio. El workflow
[`Publish Academic web image`](../../.github/workflows/publish-academico-web.yml)
construye y publica el FRONT desde `main` cuando cambian los archivos de la
aplicación o sus dependencias.

1. Integra el cambio aprobado en `main`.
2. Espera a que el workflow publique la imagen y termine su smoke test. El
   workflow publica dos tags: `main` para el redeploy habitual y el SHA completo
   del commit para una referencia inmutable y rollback.
3. En Coolify, confirma que el recurso sea `edupay-academico-web-die-20260924`,
   la imagen `ghcr.io/sherydans12/edupay-academico-web` y el tag `main`. El tag
   `main` se configura una sola vez; no habilites auto deploy.
4. Pulsa **Redeploy**. Coolify vuelve a descargar la imagen referenciada por el
   tag guardado. No uses **Restart** como sustituto ni cambies el tag a un SHA
   Git: el tag es el identificador de la imagen, no la rama ni el commit.
5. En **Deployment Logs**, confirma el digest resuelto y que el contenedor
   termine en `Running`. Verifica `https://academico.edupay.baselogic.cl/api/health`
   y `/login`.

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
- El registry usa `GITHUB_TOKEN` de Actions con `packages: write`. No crear ni
  copiar tokens de registry a variables del workflow.

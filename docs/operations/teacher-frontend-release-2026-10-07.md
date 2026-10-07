# Release docente del FRONT Académico — 2026-10-07

## Integración y CI

- Rama integrada y publicada: `main`.
- Commit integrado: `7c050e158cae855066d14ed8769892d3a083b3dc`.
- El commit contiene la auditoría docente (`3df840a`) y el arreglo de CI que
  compila `@edupay/contracts` antes de ejecutar las suites.
- CI de `main`: [run 37619044531](https://github.com/Sherydans12/edupay-academico/actions/runs/37619044531),
  `quality` y `postgresql-integration` aprobados.

## Artefacto

- Construcción limpia del FRONT desde `main` con `deploy/Dockerfile.web` y
  plataforma `linux/amd64`. El contexto Docker fue de 9,71 MB; no había
  `.env.local` en la worktree. Los únicos build args fueron las bases públicas
  documentadas de API e Identity.
- Tag publicado: `ghcr.io/sherydans12/edupay-academico-web:7c050e158cae855066d14ed8769892d3a083b3dc`.
- Digest del índice OCI: `sha256:126c06d85dbc6ca94810d5b49c635a7533a1c22f8caae3cb06f573c720ddbf47`.
- Manifest `linux/amd64`: `sha256:a45d31ea519a3386d52dfb740957915cd74d95ed92ba182ecbd2d85a26cb285d`.
- La imagen lleva las etiquetas OCI `org.opencontainers.image.revision` con el
  commit integrado y `org.opencontainers.image.source` con el repositorio
  académico.

## Coolify

- Recurso actualizado: FRONT Académico `cct0rtf5iku6fkd3t9hldnv4`,
  `edupay-academico-web-die-20260924`.
- Dominio canónico: `academico.edupay.baselogic.cl`.
- Se actualizó únicamente el tag del contenedor, de
  `sha256-ce07f61d1f5fa066828b501e333b6c7e7668577f0d8b9d6b3f5cea400d566aa2`
  a
  `sha256-126c06d85dbc6ca94810d5b49c635a7533a1c22f8caae3cb06f573c720ddbf47`.
  Se conservaron el repositorio, los dominios, las variables, los puertos, la
  red y el healthcheck.
- Redeploy manual Coolify: `dizycjzsjly4uu0efcksfi0l`, iniciado a las
  `2026-10-07 12:37:03 UTC`, estado `Success`, duración `39 s`.
- El log confirma el pull de `ghcr.io/sherydans12/edupay-academico-web@sha256:126c06d85dbc6ca94810d5b49c635a7533a1c22f8caae3cb06f573c720ddbf47`,
  inicio del contenedor nuevo y finalización del rolling update.

## Comprobaciones y alcance

- `GET /api/health`: HTTP `200`, `{"service":"edupay-academico-web","status":"ok"}`.
- `GET /login`: HTTP `200`, título `EduPay Académico`.
- Los 11 assets CSS y JavaScript referenciados por `/login` respondieron HTTP
  `200`.
- Se desplegó únicamente el FRONT. No hubo cambios en API, Identity, workers,
  bases de datos, migraciones, usuarios, DNS ni otros recursos.

## Rollback del FRONT

Para revertir solo este FRONT, fijar en Coolify el tag anterior
`sha256-ce07f61d1f5fa066828b501e333b6c7e7668577f0d8b9d6b3f5cea400d566aa2`,
guardar y ejecutar Redeploy. Verificar el digest en Deployment Logs, `Running`,
`/api/health` y `/login`. No cambiar ni retirar el recurso retenido de rollback.

# Release docente/login del FRONT Académico — 2026-10-09

## Integración y CI

- Rama integrada: `main`.
- Commit integrado: `a7faa51a026c1898f7843afdb2ceb52dce48f3d6`.
- Incluye el ajuste visual de autenticación/login y la automatización de
  publicación del FRONT.
- CI de `main`: [run 37940170066](https://github.com/Sherydans12/edupay-academico/actions/runs/37940170066),
  estado `success`.
- Publicación de imagen: [run 37940170057](https://github.com/Sherydans12/edupay-academico/actions/runs/37940170057),
  estado `success`. Se verificaron la revisión exacta, procedencia OCI,
  plataforma `linux/amd64`, arranque aislado, `/api/health`, `/login` y la
  ausencia de `Cuentas de prueba` en el login de producción.

## Artefacto

- Imagen: `ghcr.io/sherydans12/edupay-academico-web`.
- Tag de redeploy: `main`.
- Tag inmutable de rollback: `a7faa51a026c1898f7843afdb2ceb52dce48f3d6`.
- Digest del índice OCI: `sha256:aa3783c8b44d7b7456c8cdc82eebdb500b42a9393e0165ca1d311e6aa69c1e82`.
- Manifest `linux/amd64`: `sha256:29df806d6fd1361089ffce4a67502b86c70e2c481c8c286726c0b6420c1fb265`.
- El paquete GHCR se mantuvo privado. Se otorgó rol **Write** de Actions access
  únicamente al repositorio `Sherydans12/edupay-academico` para publicar con
  `GITHUB_TOKEN`; el workflow no usa tokens de registry persistentes.

## Coolify

- Recurso: `edupay-academico-web-die-20260924`, UUID
  `cct0rtf5iku6fkd3t9hldnv4`.
- Tag guardado para futuros redeploys: `main`.
- Redeploy manual inicial: `b7vdtgrpj8eip1plkaju8y5i`, iniciado
  `2026-10-09 14:06:27 UTC`, estado `Success`, duración `37 s`.
- Coolify registra además un segundo redeploy manual:
  `fvzn2bfaadnkcyusupnimw9f`, iniciado `2026-10-09 14:08:24 UTC`, estado
  `Success`, duración `9 s`. Ambos consumieron el mismo tag `main`; el digest de
  `main` no cambió entre ejecuciones.
- El log del despliegue más reciente registró el pull de
  `ghcr.io/sherydans12/edupay-academico-web:main`, `New container started`,
  `Removing old containers` y `Rolling update completed`.
- La validación DNS del dominio canónico `academico.edupay.baselogic.cl` figura
  `DNS OK`. El host secundario `www.academico.edupay.baselogic.cl` conserva el
  estado previo `DNS mismatch`; no se modificaron dominios ni DNS en este corte.
- La pestaña original de Coolify con su formulario pendiente se conservó; el
  cambio del tag se guardó desde una segunda pestaña y quedó aplicado por el
  redeploy exitoso.

## Comprobaciones productivas

- `GET /api/health`: HTTP `200`, `{"service":"edupay-academico-web","status":"ok"}`.
- `GET /login`: HTTP `200`; no incluye `Cuentas de prueba`.
- `GET /forgot-password`: HTTP `200`.
- `GET /reset-password`: HTTP `200`.
- El estado del recurso en Coolify quedó `Running`; el deployment más reciente
  (`fvzn2bfaadnkcyusupnimw9f`) terminó en `Success`.

## Alcance

Solo se publicó y desplegó el FRONT Académico. No hubo cambios en API, Identity,
workers, base de datos, migraciones, variables de entorno, dominios, DNS ni otros
recursos de Coolify.

## Rollback

Para volver al release anterior del FRONT, usar el tag inmutable
`7c050e158cae855066d14ed8769892d3a083b3dc` (digest registrado en
[el release 2026-10-07](teacher-frontend-release-2026-10-07.md)), guardar y
ejecutar **Redeploy**. Verificar `Running`, `/api/health` y `/login`. Restaurar
después el tag `main` para que los próximos redeploys tomen la publicación más
reciente.

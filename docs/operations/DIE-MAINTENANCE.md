# Mantenimiento público para releases de Identity y Académico

Este procedimiento controla temporalmente el tráfico público de las APIs
Identity y Académico mientras se pausan los escritores, se toma un recovery
point y se aplican migraciones autorizadas. No es un modo de mantenimiento de
la aplicación: es una regla de borde administrada por Coolify/Traefik.

La configuración descrita se verificó en Coolify 4.3.14 el 2026-09-23. Revisa
la sintaxis y las rutas reales del proxy antes de reutilizarla en otra versión.

## Propiedades del control

- Cubre todos los paths de cada host público, tanto por `http` como por `https`.
- Devuelve 503 sin depender de rutas de aplicación, headers de bypass ni cambios
  de autenticación.
- No crea una entrada pública alternativa para S2S. Académico llama los
  endpoints internos de Identity por la red privada compartida; conserva
  `connect_to_docker_network` en Coolify y usa el alias de Identity anunciado
  en esa red compartida (`identity-<service-uuid>:3000`) para
  `IDENTITY_INTERNAL_BASE_URL`. No asumas que el alias corto `identity:3000`
  resuelve desde Académico: puede existir sólo en la red propia de Identity.
- No incluye el host de Académico FRONT, BL, Coolify ni otros servicios.
- No bloquea procesos que escriben directamente a PostgreSQL, outbox, storage
  ni workers. Esos procesos deben pausarse por separado.

El contrato S2S entre backends usa la ruta interna. No se debe dejar abierta la
API pública de Identity para probarla. El acceso público del navegador y la
configuración JWT/JWKS son controles distintos y se verifican en sus gates.

## Revisión antes de aplicar

1. Confirma disponibilidad del operador para la ventana y los redeploys
   manuales. No pauses escrituras antes de esa confirmación.
2. Revisa el inventario de Coolify y resuelve cada recurso por UUID, proyecto y
   entorno. Lee los dominios del API Identity y del API Académico, sus labels
   activas, los routers Traefik de todos los providers y cualquier alias DNS o
   entrada HTTP adicional. Comprueba también los toggles `www/non-www` de cada
   dominio y si sus nombres alternativos tienen DNS. No infieras rutas a partir
   del nombre del recurso.
3. Confirma que todas las entradas públicas de cada API estén enumeradas por
   host y entrypoint. Identifica routers de prioridad superior, alias,
   redirecciones y reglas de catch-all. Si un alias `www` u otro hostname
   resuelve y enruta a la API, incluye ese host en la regla de mantenimiento y
   pruébalo explícitamente. Una página de Coolify que permita `www/non-www` no
   demuestra por sí sola que el alias tenga DNS ni que esté bloqueado.
4. Captura una copia restringida de la configuración dinámica vigente y anota
   el nombre del archivo propio que se añadirá, los hosts, el estado de proxy,
   las imágenes/digests previos y el procedimiento de reversión.
5. Revisa cada recurso Coolify por cambios sin guardar. Distingue el cambio de
   esta ventana de cualquier edición desconocida. No uses Reset, Save, Deploy ni
   Force Deploy sobre configuración desconocida. Si una acción de recuperación
   recrearía el recurso con cambios no revisados, detente y conserva el 503.
6. Identifica todos los escritores: APIs, tareas programadas, scheduler/outbox
   de Identity, workers de correo/sync/notificaciones y consumidores que
   escriban a PostgreSQL o storage. Usa Coolify para pausarlos; si no se pueden
   pausar independientemente, detén sus contenedores mientras se hace el backup.
   Antes de continuar, comprueba que no haya transacciones de escritura abiertas
   ni workers ejecutando trabajos.

## Instalar la regla con Coolify

Usa **Server → Proxy → Dynamic Configurations → Add** en el servidor correcto.
Guarda un archivo único para la ventana, por ejemplo
`die-release-maintenance-YYYYMMDD.yaml`. No edites el Compose del proxy, sus
archivos generados ni los routers de otros servicios. El esquema empleado es:

```yaml
http:
  routers:
    die-release-identity-maint-http:
      entryPoints:
        - http
      rule: Host(`identity.edupay.baselogic.cl`)
      priority: 1000000
      service: noop@file
    die-release-identity-maint-https:
      entryPoints:
        - https
      rule: Host(`identity.edupay.baselogic.cl`)
      priority: 1000000
      service: noop@file
      tls:
        certResolver: letsencrypt
    die-release-academic-api-maint-http:
      entryPoints:
        - http
      rule: Host(`academico-api.edupay.baselogic.cl`)
      priority: 1000000
      service: noop@file
    die-release-academic-api-maint-https:
      entryPoints:
        - https
      rule: Host(`academico-api.edupay.baselogic.cl`)
      priority: 1000000
      service: noop@file
      tls:
        certResolver: letsencrypt
```

Sustituye hosts sólo después de contrastarlos con Coolify, DNS y Traefik. La
prioridad alta hace que la ruta exacta gane a los routers normales; el servicio
`noop@file` vacío que administra Coolify produce el 503 observado. No cambies
el servicio `noop`, el catch-all ni la configuración global del proxy.

Después de guardar, confirma que el archivo figura en Dynamic Configurations,
que Traefik lo cargó y que los cuatro requests públicos siguientes devuelven
503. No sigas si hay un código distinto, error TLS o route fallback inesperado.
Repite la revisión de rutas equivalentes contra la configuración efectiva, no
sólo contra el YAML nuevo. Comprueba además que Coolify, BL y Académico FRONT
siguen respondiendo como antes.

## Validar runners de migración antes de mantenimiento

El runner Identity necesita el `schema-engine` de Prisma 7. La imagen debe
generarlo durante el build en Debian 12 con OpenSSL instalado. No descargues
engines durante una migración productiva. El workflow Identity comprueba que
existe y es ejecutable; el workflow Académico comprueba su runner desde el
commit despachado, con procedencia BuildKit y SBOM.

Después de publicar y descargar ambos runners por referencia inmutable, instala
las dependencias de desarrollo del checkout aislado Identity y ejecuta el
ensayo versionado desde la raíz del checkout Académico:

```powershell
pnpm --dir <identity-checkout> install --frozen-lockfile
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-die-migration-runners.ps1 `
  -IdentityRepoPath <identity-checkout> `
  -IdentityImage ghcr.io/sherydans12/edupay-identity-migrate@sha256:<digest> `
  -AcademicImage ghcr.io/sherydans12/edupay-academico-migrate@sha256:<digest>
```

El script crea una red y PostgreSQL 15 efímeros sin volumen persistente ni
conexión productiva. Ejecuta los comandos por defecto de ambas imágenes:
Identity desde cero y desde sus tres migraciones históricas, más el test de
integración PostgreSQL de provisioning; Académico desde cero y desde las diez
migraciones históricas. Comprueba los trece checksums, preserva filas sintéticas
de usuario/tenant/recibo y tenant/alumno, confirma que STAFF y las nuevas tablas
existen sin crear perfiles, asignaciones o episodios DIE, y retira sólo sus
contenedores y red temporales.

Una etiqueta local no es evidencia de publicación. Registra el digest remoto,
la revisión del source, el comando del contenedor y la arquitectura Linux/amd64
en el manifiesto del paquete. Si falla cualquiera de estos checks, no abras
mantenimiento.

## Pausar escritores, backup y gates

El orden de la ventana es:

1. Instalar y verificar los 503 públicos.
2. Pausar por Coolify los escritores de Identity y Académico. El proxy no pausa
   el scheduler/outbox ni workers internos.
3. Comprobar transacciones abiertas y trabajos activos; repetir la comprobación
   justo antes del backup para detectar carreras.
4. Ejecutar una sola vez el launcher y uploader protegidos documentados en
   [RUNBOOK.md, sección de backups](RUNBOOK.md#backups-y-cambios-de-esquema),
   desde el contexto soportado del host. No asumir que las credenciales faltan
   porque `/etc/edupay/backup-r2.env` no esté montado en otro contexto; no crear
   esa ruta, volcar variables ni copiar secretos. Verificar que el manifiesto
   del recovery point identifique los recursos PostgreSQL, base/schema, ledger
   y checksums históricos de ambas bases, e incluya el storage privado. Exigir
   integridad local y R2 y correspondencia de restauración aislada antes de
   continuar. Detenerse ante cualquier discrepancia.
5. Correr preflights de ledger/esquema. Sólo después de verificar los
   checksums históricos se pueden aplicar las migraciones exactas autorizadas.
   No usar `migrate resolve`, SQL manual ni una migración de reconciliación para
   convertir un preflight fallido en verde.
6. Seguir el orden de entrega Identity → Académico API → FRONT. Los redeploys
   siguen siendo manuales. Mantén la red privada y verifica S2S desde Académico
   hacia Identity por `IDENTITY_INTERNAL_BASE_URL`; usa un request de prueba
   sintético autenticado y registra sólo status/requestId, no token ni cuerpo.
7. Levantar escritores y quitar mantenimiento sólo cuando los recursos
   correspondientes estén sanos y sus gates hayan pasado.

Verificación pública sin guardar cuerpos ni credenciales:

```powershell
curl.exe --silent --show-error --output NUL --write-out "identity-http=%{http_code}`n" http://identity.edupay.baselogic.cl/api/v1/identity/health
curl.exe --silent --show-error --output NUL --write-out "identity-https=%{http_code}`n" https://identity.edupay.baselogic.cl/api/v1/identity/health
curl.exe --silent --show-error --output NUL --write-out "academic-http=%{http_code}`n" http://academico-api.edupay.baselogic.cl/api/v1/health/live
curl.exe --silent --show-error --output NUL --write-out "academic-https=%{http_code}`n" https://academico-api.edupay.baselogic.cl/api/v1/health/live
```

Durante mantenimiento se espera 503 en los cuatro requests. Comprueba los
dominios de todos los routers equivalentes que encuentre el inventario; no
consideres estos cuatro como prueba de que no existe un alias adicional.

## Recuperación

- **Gate fallido antes de una migración:** no hay rollback de esquema. Detén la
  promoción y conserva datos y recovery point. Recupera sólo los recursos
  afectados con sus imágenes/configuración previas verificadas usando Coolify.
  Prioriza restaurar disponibilidad: no mantengas el 503 durante una
  investigación prolongada si el runtime anterior puede recuperarse de forma
  segura. Repite health, red privada y S2S autenticado; después elimina sólo la
  regla temporal y comprueba las rutas públicas/alias antes de continuar.
- **Gate fallido después de una migración aditiva:** no ejecutes DOWN, reset,
  `migrate resolve` ni SQL de compensación. Conserva el esquema, mantén la API
  pública bloqueada y utiliza un binario compatible o la ruta de recuperación
  aprobada para ese release.
- **Configuración pendiente desconocida:** no la guardes ni la descartes para
  poder desplegar. Identifícala con el dueño del recurso. Mientras no sea seguro
  iniciar el servicio mediante Coolify, conserva el mantenimiento y detén el
  release.
- **Reversión del control:** cuando la recuperación o promoción ya esté sana,
  elimina en Coolify Dynamic Configurations únicamente el archivo creado para
  esta ventana. No restaures el directorio dinámico completo, no borres otras
  reglas y no reinicies Traefik manualmente. Verifica de nuevo HTTP/HTTPS y que
  BL, Coolify y FRONT sigan intactos.

Registra en el paquete operativo el nombre del archivo, las rutas verificadas,
la pausa de cada escritor, el recovery point, los gates, los redeploys y si se
retiró la regla. Nunca agregues secretos, dumps, logs completos ni evidencia con
datos personales a Git.

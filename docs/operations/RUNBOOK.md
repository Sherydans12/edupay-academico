# Cambios seguros y recuperación

Aplica a ambos repositorios. Leer primero [topología vigente](PRODUCTION.md).
Este runbook documenta la operación existente; no autoriza una migración,
un nuevo contrato ni cambios fuera del alcance aprobado.

## Inicio de una mejora

1. Obtener refs remotas y revisar git status, rama y worktrees. No usar un
   directorio sucio como imagen implícita de producción.
2. Partir de `origin/main` actualizado, que integra el código productivo y esta
   documentación. Crear una rama `codex/<mejora>` y otro worktree limpio.
   `codex/production-stable-baseline` conserva la referencia de cierre.
3. En Académico, main contiene el frontend 4f5ad28 y el API release funcional
   e5bd78a. Los workers permanecen pinned a su digest anterior: actualizar main no implica
   redeployar todos los recursos ni ejecutar migraciones.
4. Registrar alcance, recurso UUID afectado, contrato/esquema afectado y pruebas.
   Los pendientes locales de v2, rollover y almacenamiento son trabajo futuro,
   no parte de esta publicación.
5. Desarrollo y pruebas usan bases, volúmenes y secretos independientes. No
   reutilizar DATABASE_URL productiva, cuentas reales o dominios productivos.
   No existe un staging BL-002/Académico certificado por este cierre:
   crearlo requiere un inventario y validación propios, no reutilizar Admission.

## Antes de tocar Coolify

- Reconciliar UUID, proyecto, entorno, repositorio, rama, SHA/digest, Dockerfile,
  target, comando, dominios, puertos, healthchecks, redes, montajes y nombres de
  variables. Capturar snapshot privado con acceso restringido.
- Revisar historial y producto del último artefacto realmente sano. Un deployment
  reciente puede corresponder a código más antiguo. No inventar SHAs de rollback.
- Comprobar un único propietario por dominio tanto en Coolify como en labels
  de contenedores activos y upstreams Traefik.
- Conservar imagen anterior con tag de recuperación, configuración y montajes.
  Confirmar que la imagen existe; seleccionar rollback en Coolify puede
  reconstruir y sobrescribir tags, por lo que no basta el historial.
- Identificar hooks y entrypoints. BL BACK debe conservar RUN_MIGRATIONS
  desactivado. No lanzar migration runners como efecto lateral de un redeploy.
- Revisar automatismos antes de publicar en main: desde el release 2026-09-14,
  auto deploy está desactivado en BL FRONT y BACK (`Manual deployments only`) y
  Academic FRONT también permanece desactivado. Los SHAs están fijados, pero
  no asumir que publicar documentación no genera un webhook.
  Las ramas documentales y baselines no sustituyen la configuración de release.

## Gates por recurso

| Recurso | Gate obligatorio |
|---|---|
| BL BACK | SHA aprobado, /api/v1/health 200, JWT/conexión y uploads conservados, migraciones omitidas |
| BL FRONT | /login 200, producto BL-002, bundle usa API BL-002, login real y sesión tras recargar |
| Academic API | Digest exacto, /api/v1/health/live y /ready 200, DB propia y CORS exacto |
| Academic FRONT | Target runtime, puerto 3000, /login 200, base /api/v1, Identity propio, navegación real de los módulos cambiados |
| Identity | Health y JWKS 200, issuer/audience, cookies y CORS, conectividad privada de DB; ninguna ruta duplicada |
| Workers | Healthy, imagen aprobada, comando/DB propios, sin puertos públicos; distinguir salud de completitud de runs |
| Persistencia | Montajes conservados, backup del sistema afectado verificado y autorización específica si hay cambios de esquema |

HTTP→HTTPS debe volver al mismo dominio; verificar TLS en los cinco dominios.
Revisar assets públicos y rutas recuperadas, no únicamente el HTML de login.
No registrar tokens, cookies, cuerpos de login ni variables completas como
evidencia: guardar códigos HTTP, requestId, SHA/digest y comprobaciones booleanas.

## Orden y rollback

Desplegar únicamente recursos que lo necesitan: BL BACK, BL FRONT, Academic API
y Academic FRONT, en ese orden cuando todos estén implicados. No redeployar
Identity ni workers sanos por arrastre de un cambio de UI.

Si falla un gate real, detener la promoción y restaurar **solo ese recurso**
a su imagen/configuración comprobadas; repetir sus gates y comprobar que las
otras rutas siguen intactas. Un fallo del verificador debe investigarse sin
confundirlo con un fallo del producto. No ejecutar DOWN/reset/migraciones
destructivas para revertir código. Si el esquema ya cambió de forma aditiva,
evaluar compatibilidad hacia atrás: revertir la app no significa borrar columnas.

La asociación privada de Identity usa connect_to_docker_network en Coolify.
La versión instalada conecta la red compartida al iniciar el servicio; no
interpretar su ausencia en el Compose generado como prueba suficiente de error.
Comprobar el contenedor y la conectividad privada antes de cambiarlo.

## Backups y cambios de esquema

- Timer `edupay-backup.timer`, servicio `edupay-backup.service`, cada seis horas.
  Launcher protegido `/root/run-edupay-native-backup.sh`; uploader existente
  `/opt/edupay-pilot/academico/ops/backup/upload-to-r2.sh`.
- Cobertura verificada en esta fase: PostgreSQL Académico e Identity. Punto
  previo a reparación `20260911T130031Z`; posterior `20260911T130501Z`.
  Se verificaron checksums locales y objetos remotos R2.
- Se verificó la restauración del backup real protegido de PostgreSQL BL-002.
  La evidencia no demuestra por sí sola consistencia completa de la base viva
  ni cobertura/restauración íntegra de todos los uploads.
- Antes de cualquier cambio de esquema o datos se exige un recovery point
  vigente de PostgreSQL BL-002 y del volumen de uploads, con checksum y
  restauración aislada verificable.
  Antes de su próximo cambio con riesgo de datos, demostrar cobertura de su
  PostgreSQL 18 y uploads con herramientas compatibles y restauración aislada.
- Existe un backup administrativo Coolify separado; tampoco reemplaza un
  backup de datos de negocio.
- Conservar recovery points anteriores. Nunca borrar volúmenes o ejecutar
  `docker system prune --volumes` como limpieza genérica.
- La base Académico tiene una reparación aditiva autorizada que no alteró el
  ledger Prisma. Ver [cierre](PHASE-CLOSEOUT.md). **No ejecutar la cadena
  histórica de migrate deploy a ciegas** ni marcar migraciones como aplicadas
  sin comparar cada efecto y documentar una autorización nueva.
- Una nueva base desechable debe validar la cadena del release seleccionado;
  una base existente debe comparar catálogo y ledger. Son verificaciones
  diferentes. No usar el SQL ya aplicado como receta idempotente general.

## Limpieza y cierre de un cambio

No usar estado stopped, nombre de prueba o dominio vacío como única evidencia
de abandono. Buscar referencias, consumidores de red, volúmenes, backups y
artefactos de rollback; eliminar por UUID comprobado. No borrar otros proyectos.

Al cerrar: registrar SHA/digest y deployment, resultado de gates, rollback si lo
hubo, backup aplicable y pendientes reales. Actualizar el mismo inventario en
ambos repositorios cuando cambie una conexión. Dejar worktree limpio y rama
publicada; conservar trabajo ajeno sin reset, clean, force push o poda global.

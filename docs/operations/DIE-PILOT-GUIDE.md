# Guía breve de primer uso del piloto DIE

Estado de partida: el módulo está desplegado, pero el perfil institucional y el
piloto aún no han sido configurados por el usuario. Esta guía usa las rutas y
acciones presentes en la interfaz publicada. No crea usuarios ni datos reales.

## Entrar

1. Inicia sesión en Académico con una membership activa `TENANT_ADMIN` del
   establecimiento correcto.
2. Desde Administración académica, abre **Inclusión educativa** en la
   navegación, o visita directamente
   <https://academico.edupay.baselogic.cl/die>.
3. `TENANT_ADMIN` puede acceder a DIE sin una membresía DIE adicional. El
   acceso se verifica con el contexto de Identity y el tenant activo. Un rol
   `SYSTEM_ADMIN` de la administración heredada no concede por sí solo acceso
   a un tenant.

## Configurar la institución

En `/die`, usa **Configurar perfil** en el aviso de perfil incompleto o abre la
pestaña **Perfil**. Completa explícitamente los campos **Nombre institucional
para documentos** y **Zona horaria IANA**, y pulsa **Guardar perfil**. El ejemplo
`America/Santiago` que aparece en la pantalla es un placeholder; el
administrador debe seleccionar la zona real de la institución. El sistema no
usa automáticamente la zona del navegador ni la del servidor.

Sin zona horaria siguen disponibles los hechos que sólo tienen fecha, pero no
se registran horas ni se calculan vencimientos. Sin nombre institucional, la
exportación PDF completa permanece bloqueada.

## Dar acceso al personal cuando haga falta

La administración de Académico → **Personas** crea perfiles académicos y sus
accesos `TEACHER`/`STUDENT`; esa pantalla no crea un usuario `STAFF`. Si una
persona aún no tiene una membership Identity activa `STAFF` en el tenant
correcto, un `TENANT_ADMIN` debe provisionarla mediante el flujo existente de
Identity `POST /api/v1/tenants/{tenantId}/memberships`, con el rol `STAFF`, y
completar la invitación o activación que corresponda. Identity administra la
cuenta y su acceso; no se debe emitir una contraseña permanente por fuera de
ese flujo.

Después, en `/die` → **Equipo**, escribe el **Username institucional** exacto y
pulsa **Incorporar como especialista**. La pantalla no ofrece una búsqueda
parcial ni un listado de usuarios. Incorporar a alguien aquí lo agrega al
equipo DIE; no modifica roles ni permisos de Identity.

## Equipo y coordinación

El miembro añadido aparece en **Equipo** como especialista ordinario. Un
administrador `TENANT_ADMIN` puede asignar o retirar la coordinación con
**Hacer coordinador** o **Quitar coordinación** en la fila de esa persona. La
coordinación DIE es un permiso académico separado; no cambia el rol `STAFF` ni
otorga administración general.

## Validar el primer uso

- Comprueba que `/die` abre dentro del tenant previsto y que el perfil aparece
  completo después de guardarlo.
- Si se incorporó una persona, pídele iniciar sesión con su cuenta Identity y
  abrir `/die`; su membership `STAFF` activa y su incorporación exacta al
  equipo deben permitir el acceso. El servidor vuelve a verificar membership,
  tenant y permisos en cada operación.
- Revisa las pestañas **Alumnos**, **Hoja de vida**, **Pendientes**, **Equipo** y
  **Perfil**. En una base sin expedientes es normal que las listas estén
  vacías. No crees expedientes de prueba en producción para comprobar permisos.

Si la opción **Inclusión educativa** no aparece o `/die` devuelve acceso
denegado, confirma que la sesión de Académico use la membership Identity
`TENANT_ADMIN` del tenant activo. Un administrador de otro tenant o una cuenta
administrativa heredada no se convierte automáticamente en administrador
académico.

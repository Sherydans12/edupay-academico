'use client';

import { Alert, Badge, Button, Input, Skeleton } from '@edupay/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  AcademicApiError,
  type AcademicApiClient,
} from '@/api/academic-client';
import { createAcademicApiClient } from '@/api/client-factory';
import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { AppShell } from '@/components/app-shell';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

type OperationalProfile = Awaited<
  ReturnType<AcademicApiClient['getTenantOperationalProfile']>
>;

function profileError(error: unknown, saving = false): string {
  if (error instanceof AcademicApiError) {
    if (error.status === 401)
      return 'La sesión ya no está disponible. Vuelve a iniciar sesión para continuar.';
    if (error.status === 403)
      return saving
        ? 'Tu sesión no tiene permiso para cambiar el perfil de esta institución.'
        : 'Tu sesión no tiene permiso para consultar el perfil de esta institución.';
    if (error.status === 409)
      return 'El perfil cambió en otra sesión. Tus campos siguen aquí; recarga la página para revisar la versión vigente antes de guardar.';
    return `${error.message}${error.requestId !== 'unavailable' ? ` Código de solicitud: ${error.requestId}.` : ''}`;
  }
  return error instanceof Error
    ? error.message
    : 'Inténtalo nuevamente. Si el problema continúa, informa el código de solicitud a soporte.';
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return 'Aún no se ha guardado';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AcademicAdminSettingsScreen({
  api,
  dataMode = 'real',
  session: suppliedSession = demoSessions.admin,
}: {
  api?: AcademicApiClient;
  dataMode?: 'demo' | 'real';
  session?: TrustedCurrentSession;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const session = useTrustedCurrentSession(suppliedSession).session;
  const contextKey = `${session.tenantId}:${session.membershipId}`;
  const currentContext = useRef(contextKey);

  const [profile, setProfile] = useState<OperationalProfile | null>(null);
  const [profileContextKey, setProfileContextKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadErrorContextKey, setLoadErrorContextKey] = useState('');
  const [institutionDisplayName, setInstitutionDisplayName] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    currentContext.current = contextKey;
  }, [contextKey]);

  const loadProfile = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const requestedContext = contextKey;
    setLoadError('');
    setLoadErrorContextKey('');
    setSaved(false);
    try {
      const nextProfile = await client.getTenantOperationalProfile();
      if (
        sequence !== requestSequence.current ||
        currentContext.current !== requestedContext
      ) {
        return;
      }
      setProfile(nextProfile);
      setProfileContextKey(requestedContext);
      setInstitutionDisplayName(nextProfile.institutionDisplayName ?? '');
      setTimeZone(nextProfile.timeZone ?? '');
    } catch (error) {
      if (
        sequence !== requestSequence.current ||
        currentContext.current !== requestedContext
      ) {
        return;
      }
      setLoadError(profileError(error));
      setLoadErrorContextKey(requestedContext);
      setProfile(null);
      setProfileContextKey('');
    }
  }, [client, contextKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProfile(), 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [loadProfile]);

  const profileIsCurrent = profileContextKey === contextKey && profile !== null;
  const loading = !profileIsCurrent && loadErrorContextKey !== contextKey;
  const canManage = session.roles.includes('TENANT_ADMIN');
  const normalizedInstitution = institutionDisplayName.trim() || null;
  const normalizedTimeZone = timeZone.trim() || null;
  const hasChanges =
    profileIsCurrent &&
    (normalizedInstitution !== profile.institutionDisplayName ||
      normalizedTimeZone !== profile.timeZone);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profileIsCurrent || !canManage || !hasChanges) return;
    const requestedContext = contextKey;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const updated = await client.updateTenantOperationalProfile({
        institutionDisplayName: normalizedInstitution,
        timeZone: normalizedTimeZone,
        expectedVersion: profile.version,
      });
      if (currentContext.current !== requestedContext) return;
      setProfile(updated);
      setProfileContextKey(requestedContext);
      setInstitutionDisplayName(updated.institutionDisplayName ?? '');
      setTimeZone(updated.timeZone ?? '');
      setSaved(true);
    } catch (error) {
      if (currentContext.current === requestedContext)
        setSaveError(profileError(error, true));
    } finally {
      if (currentContext.current === requestedContext) setSaving(false);
    }
  }

  return (
    <AppShell dataMode={dataMode} session={session}>
      <PageHeading
        description="Define los datos institucionales que aparecen en documentos y ayudan a interpretar fechas académicas."
        title="Configuración institucional"
      />
      {loading ? (
        <div
          aria-label="Cargando perfil institucional"
          className="academic-loading"
        >
          <Skeleton />
          <Skeleton />
        </div>
      ) : loadErrorContextKey === contextKey ? (
        <Alert
          action={
            <Button onClick={() => void loadProfile()} variant="secondary">
              Reintentar
            </Button>
          }
          title="No pudimos cargar el perfil institucional"
          tone="error"
        >
          {loadError}
        </Alert>
      ) : profileIsCurrent ? (
        <section
          aria-labelledby="institution-profile-title"
          className="academic-panel admin-profile-panel"
        >
          <div className="section-heading">
            <div>
              <h2 id="institution-profile-title">
                Perfil institucional operativo
              </h2>
              <p>
                Se usa en documentos académicos y para interpretar fechas. No
                cambia la identidad ni el tenant de EduPay.
              </p>
            </div>
            <Badge tone={profile.complete ? 'success' : 'warning'}>
              {profile.complete ? 'Completo' : 'Incompleto'}
            </Badge>
          </div>

          {saveError ? (
            <Alert title="No pudimos guardar el perfil" tone="error">
              {saveError}
            </Alert>
          ) : null}
          {saved ? (
            <Alert title="Perfil institucional guardado" tone="success">
              Los documentos y fechas usarán la información vigente desde ahora.
            </Alert>
          ) : null}
          {!canManage ? (
            <Alert title="Perfil en solo lectura" tone="info">
              Sólo una persona administradora del tenant puede cambiar estos
              datos.
            </Alert>
          ) : null}

          <form
            className="academic-form"
            onSubmit={(event) => void save(event)}
          >
            <p className="admin-profile-intro">
              Ambos campos son opcionales. Completa los que necesita tu
              operación; no se agregan datos institucionales fuera de este
              perfil.
            </p>
            <div className="academic-form__fields admin-profile-fields">
              <Input
                hint="Se imprime en las exportaciones DIE. Sin este nombre, el PDF no puede generarse como documento institucional completo."
                id="admin-institution-display-name"
                label="Nombre institucional para documentos (opcional)"
                maxLength={240}
                readOnly={!canManage}
                value={institutionDisplayName}
                onChange={(event) =>
                  setInstitutionDisplayName(event.target.value)
                }
              />
              <Input
                hint="Usa una zona horaria IANA, por ejemplo America/Santiago. Sin ella, Académico conserva los hechos por fecha y no calcula vencimientos por hora."
                id="admin-institution-time-zone"
                label="Zona horaria IANA (opcional)"
                maxLength={80}
                readOnly={!canManage}
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
              />
            </div>
            <div className="admin-profile-footer">
              <p>Última actualización: {formatUpdatedAt(profile.updatedAt)}</p>
              {canManage ? (
                <Button disabled={!hasChanges} loading={saving} type="submit">
                  Guardar perfil
                </Button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}

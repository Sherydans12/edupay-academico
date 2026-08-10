'use client';

import { Alert, Badge, Button, Dialog, Input } from '@edupay/ui';
import { useMemo, useState } from 'react';

import { AcademicApiError, type AcademicApiClient } from '@/api/academic-client';
import { useIdentitySession, type IdentitySessionContextValue } from '@/auth/session-provider';
import { identityErrorMessage, type ActivationChallenge, type InvitationState, type ProvisionedMembership } from '@/identity/identity-client';

export type AccountProvisioningActions = Pick<IdentitySessionContextValue, 'provisionMembership' | 'inviteMembership' | 'createActivationChallenge'>;

interface AcademicPerson {
  email: string | null;
  firstName: string;
  id: string;
  identityUserId: string | null;
  lastName: string;
}

function usernameSuggestion(person: AcademicPerson): string {
  return `${person.firstName}.${person.lastName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 128);
}

function academicError(error: unknown): string {
  if (error instanceof AcademicApiError) {
    if (error.status === 403) return 'Tu sesión no puede vincular esta persona en el tenant activo.';
    if (error.status === 404) return 'El registro académico ya no está disponible.';
    return `${error.message}${error.requestId !== 'unavailable' ? ` Solicitud ${error.requestId}.` : ''}`;
  }
  return identityErrorMessage(error);
}

export function AccountProvisioning({
  api,
  identityActions,
  kind,
  onLinked,
  person,
}: {
  api: AcademicApiClient;
  identityActions?: AccountProvisioningActions | undefined;
  kind: 'student' | 'teacher';
  onLinked(): void;
  person: AcademicPerson;
}) {
  const sessionIdentity = useIdentitySession();
  const identity = identityActions ?? sessionIdentity ?? undefined;
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(() => usernameSuggestion(person));
  const [email, setEmail] = useState(person.email ?? '');
  const [provisioned, setProvisioned] = useState<ProvisionedMembership | null>(null);
  const [invitation, setInvitation] = useState<InvitationState | null>(null);
  const [challenge, setChallenge] = useState<ActivationChallenge | null>(null);
  const [phase, setPhase] = useState<'form' | 'provisioning' | 'linking' | 'partial' | 'activation' | 'complete'>('form');
  const [error, setError] = useState('');
  const role = kind === 'student' ? 'STUDENT' : 'TEACHER';
  const personName = `${person.firstName} ${person.lastName}`;
  const busy = ['provisioning', 'linking', 'activation'].includes(phase);
  const expiry = useMemo(() => {
    const value = invitation?.expiresAt ?? challenge?.expiresAt;
    return value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
  }, [challenge?.expiresAt, invitation?.expiresAt]);

  function resetVolatileState() {
    setChallenge(null);
    setInvitation(null);
    setProvisioned(null);
    setError('');
    setPhase('form');
    setUsername(usernameSuggestion(person));
    setEmail(person.email ?? '');
  }

  function closeDialog() {
    resetVolatileState();
    setOpen(false);
  }

  async function activate(created: ProvisionedMembership) {
    if (!identity) return;
    setPhase('activation'); setError(''); setChallenge(null);
    try {
      if (created.activation.emailInvitationAvailable) {
        setInvitation(await identity.inviteMembership(created.membershipId));
      } else if (created.activation.activationChallengeAvailable) {
        setChallenge(await identity.createActivationChallenge(created.membershipId));
      }
      setPhase('complete');
      onLinked();
    } catch (nextError) {
      setError(identityErrorMessage(nextError));
      setPhase('complete');
      onLinked();
    }
  }

  async function link(created: ProvisionedMembership) {
    setPhase('linking'); setError('');
    try {
      if (kind === 'student') await api.linkStudentIdentity(person.id, { identityUserId: created.userId });
      else await api.linkTeacherIdentity(person.id, { identityUserId: created.userId });
      await activate(created);
    } catch (nextError) {
      setError(academicError(nextError));
      setPhase('partial');
    }
  }

  async function provision() {
    if (!identity) return;
    setPhase('provisioning'); setError('');
    try {
      const created = await identity.provisionMembership({
        institutionalUsername: username,
        ...(email ? { email } : {}),
        role,
      });
      setProvisioned(created);
      await link(created);
    } catch (nextError) {
      setError(identityErrorMessage(nextError));
      setPhase('form');
    }
  }

  if (person.identityUserId) return <Badge tone="success">Acceso vinculado</Badge>;

  return <>
    <Button disabled={!identity} onClick={() => setOpen(true)} size="sm" variant="secondary">Crear acceso</Button>
    <Dialog description={`Provisiona una membresía ${role} y vincúlala al registro académico de ${personName}.`} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetVolatileState(); }} open={open} title="Crear acceso a Académico">
      <div className="provisioning-dialog">
        <div className="provisioning-role"><span>Rol fijo por registro académico</span><Badge tone="info">{role}</Badge></div>
        {error ? <Alert title={phase === 'partial' ? 'Identity creó la cuenta, pero falta el vínculo académico' : phase === 'complete' ? 'Acceso vinculado; falta entregar la activación' : 'No pudimos completar el acceso'} tone={phase === 'partial' || phase === 'complete' ? 'warning' : 'error'}>{error}</Alert> : null}
        {phase === 'form' || phase === 'provisioning' ? <>
          <Input autoCapitalize="none" id={`${kind}-${person.id}-username`} label="Usuario institucional" maxLength={128} onChange={(event) => setUsername(event.target.value)} required value={username} />
          <Input id={`${kind}-${person.id}-access-email`} label="Correo para invitación (opcional)" maxLength={320} onChange={(event) => setEmail(event.target.value)} type="email" value={email} hint="Si lo dejas vacío, Identity generará un código de activación de un solo uso." />
          <p className="provisioning-note">El administrador no define la contraseña. La persona elegirá su contraseña permanente al activar la cuenta.</p>
          <div className="provisioning-actions"><Button onClick={closeDialog} variant="secondary">Cancelar</Button><Button disabled={!username.trim()} loading={phase === 'provisioning'} onClick={() => void provision()}>Crear y vincular</Button></div>
        </> : null}
        {phase === 'linking' ? <p aria-live="polite" className="provisioning-progress">Identity creó la membresía. Vinculando ahora el usuario con el registro académico…</p> : null}
        {phase === 'partial' && provisioned ? <div className="provisioning-partial"><dl><div><dt>Usuario Identity</dt><dd>{provisioned.userId}</dd></div><div><dt>Membresía</dt><dd>{provisioned.membershipId}</dd></div><div><dt>Usuario institucional</dt><dd>{provisioned.institutionalUsername}</dd></div></dl><p>No se eliminó la cuenta de Identity. Estos identificadores se conservarán solo mientras este diálogo permanezca abierto.</p><div className="provisioning-actions"><Button onClick={closeDialog} variant="secondary">Cerrar</Button><Button onClick={() => void link(provisioned)}>Reintentar vínculo académico</Button></div></div> : null}
        {phase === 'activation' ? <p aria-live="polite" className="provisioning-progress">Vínculo académico confirmado. Preparando el método de activación de Identity…</p> : null}
        {phase === 'complete' && invitation ? <div className="provisioning-complete"><Alert title="Invitación solicitada" tone="success">Identity registró la entrega del correo. No se expuso ningún token de invitación.</Alert><p>La invitación vence el {expiry}.</p><Button onClick={closeDialog}>Terminar</Button></div> : null}
        {phase === 'complete' && challenge ? <div className="provisioning-complete"><Alert title="Código de activación creado" tone="warning">Muéstralo solo a la persona indicada mediante un canal institucional seguro. No podrá recuperarse después de cerrar este diálogo.</Alert><div className="activation-secret"><span>Usuario institucional</span><strong>{challenge.username}</strong><span>Código de un solo uso</span><code>{challenge.activationCode}</code></div><p>Vence el {expiry}. Para usarlo: abre <strong>/activate-code</strong>, ingresa el usuario, este código y una contraseña elegida por la persona.</p><div className="provisioning-actions"><Button onClick={() => void navigator.clipboard?.writeText(challenge.activationCode)} variant="secondary">Copiar código</Button><Button onClick={closeDialog}>Ya lo entregué de forma segura</Button></div></div> : null}
        {phase === 'complete' && !invitation && !challenge && provisioned ? <div className="provisioning-complete"><p>El vínculo académico está confirmado. Reintenta generar el método de activación sin volver a crear la membresía.</p><div className="provisioning-actions"><Button onClick={closeDialog} variant="secondary">Cerrar</Button><Button onClick={() => void activate(provisioned)}>Reintentar activación</Button></div></div> : null}
        {busy ? <span className="sr-only" aria-live="polite">Procesando acceso</span> : null}
      </div>
    </Dialog>
  </>;
}

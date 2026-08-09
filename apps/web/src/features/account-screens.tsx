'use client';

import { Alert, Button } from '@edupay/ui';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';

import { destinationForRoles, useIdentitySession } from '@/auth/session-provider';
import { AccountShell, PasswordFields } from '@/components/account-shell';
import {
  IdentityApiError,
  IdentityBrowserClient,
  identityErrorMessage,
  identityMembershipSchema,
  type IdentityMembership,
} from '@/identity/identity-client';
import { getClientEnvironment } from '@/config/environment';

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Navegador web';
  const browser = /Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'Navegador';
  const system = /Windows/.test(navigator.userAgent) ? 'Windows' : /Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : /Mac OS/.test(navigator.userAgent) ? 'macOS' : 'web';
  return `${browser} en ${system}`;
}

function publicIdentityClient(): IdentityBrowserClient {
  return new IdentityBrowserClient({ baseUrl: getClientEnvironment().NEXT_PUBLIC_IDENTITY_BASE_URL });
}

function tokenFromQuery(params: URLSearchParams, name = 'token'): string {
  return params.get(name)?.slice(0, 1024) ?? '';
}

function removeSensitiveQuery(pathname: string): void {
  window.history.replaceState(window.history.state, '', pathname);
}

function errorTitle(error: unknown): string {
  if (error instanceof IdentityApiError && error.status === 410) return 'El enlace ya no está disponible';
  if (error instanceof IdentityApiError && error.status === 429) return 'Demasiados intentos';
  return 'No pudimos completar la solicitud';
}

export function LoginScreen() {
  const auth = useIdentitySession();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [tenantHandle, setTenantHandle] = useState('');
  const [choices, setChoices] = useState<IdentityMembership[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: { preventDefault(): void }, selectedHandle = tenantHandle) {
    event.preventDefault();
    if (!auth) return;
    setLoading(true); setError('');
    try {
      const session = await auth.login({ identifier, password, ...(selectedHandle ? { tenantHandle: selectedHandle } : {}), deviceLabel: deviceLabel() });
      setPassword('');
      router.replace(destinationForRoles(session.roles));
    } catch (nextError) {
      if (nextError instanceof IdentityApiError && nextError.code === 'MEMBERSHIP_SELECTION_REQUIRED') {
        const nextChoices = nextError.details.flatMap((item) => {
          const parsed = identityMembershipSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
        if (nextChoices.length) {
          setChoices(nextChoices);
          setError('Selecciona la institución donde quieres entrar.');
        } else setError(identityErrorMessage(nextError));
      } else setError(identityErrorMessage(nextError));
    } finally { setLoading(false); }
  }

  return <AccountShell title="Entra a tu espacio académico" description="Usa tu usuario institucional o correo verificado. Identity confirmará tu institución, membresía y rol." showBackLink={false}>
    <form className="account-form" onSubmit={submit}>
      {error ? <Alert title={choices.length ? 'Elige una membresía' : 'No pudimos iniciar sesión'} tone={choices.length ? 'info' : 'error'}>{error}</Alert> : null}
      {choices.length ? <fieldset className="membership-choices"><legend>Institución</legend>{choices.map((choice) => <button key={choice.membershipId} onClick={(event) => { setTenantHandle(choice.tenantHandle); void submit(event, choice.tenantHandle); }} type="button"><strong>{choice.tenantHandle}</strong><span>{choice.roles.join(' · ')}</span></button>)}</fieldset> : <>
        <label className="account-field"><span>Usuario institucional o correo verificado</span><input autoComplete="username" maxLength={320} onChange={(event) => setIdentifier(event.target.value)} required value={identifier} /></label>
        <label className="account-field"><span>Contraseña</span><input autoComplete="current-password" maxLength={1024} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
        <label className="account-field"><span>Institución <small>(opcional)</small></span><input autoCapitalize="none" maxLength={128} onChange={(event) => setTenantHandle(event.target.value)} placeholder="colegio-conquistadores" value={tenantHandle} /><small>Úsala solo si tu correo pertenece a más de una institución.</small></label>
        <Button className="account-submit" loading={loading} type="submit">Entrar</Button>
      </>}
      <div className="account-links"><Link href="/forgot-password">Olvidé mi contraseña</Link><Link href="/activate-code">Tengo un código de activación</Link></div>
    </form>
  </AccountShell>;
}

function SecretPasswordFlow({ kind }: { kind: 'invitation' | 'reset' }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'form' | 'success'>('form');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const client = useMemo(() => publicIdentityClient(), []);
  const token = tokenFromQuery(params);
  const isInvitation = kind === 'invitation';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || password !== confirmation) return;
    setLoading(true); setError(null);
    try {
      if (isInvitation) await client.acceptInvitation(token, password);
      else await client.confirmPasswordRecovery(token, password);
      setPassword(''); setConfirmation(''); removeSensitiveQuery(pathname); setState('success');
    } catch (nextError) { setError(nextError); } finally { setLoading(false); }
  }

  return <AccountShell title={isInvitation ? 'Activa tu cuenta' : 'Crea una nueva contraseña'} description={isInvitation ? 'Elige tu contraseña permanente. La invitación define la institución y el rol; no puedes cambiarlos desde este enlace.' : 'Este enlace es personal y de un solo uso. Al confirmar, Identity revocará las sesiones que correspondan.'}>
    {state === 'success' ? <div className="account-success"><span aria-hidden="true">✓</span><h2>{isInvitation ? 'Cuenta activada' : 'Contraseña actualizada'}</h2><p>Ya puedes iniciar sesión con tus credenciales.</p><Link className="button-link button-link--primary" href="/login">Ir al inicio de sesión</Link></div> : token ? <form className="account-form" onSubmit={submit}>{error ? <Alert title={errorTitle(error)} tone="error">{identityErrorMessage(error)}</Alert> : null}<PasswordFields confirmation={confirmation} onConfirmation={setConfirmation} onPassword={setPassword} password={password} /><Button className="account-submit" disabled={password !== confirmation} loading={loading} type="submit">{isInvitation ? 'Activar cuenta' : 'Guardar nueva contraseña'}</Button></form> : <Alert title="Falta el enlace seguro" tone="warning">Abre nuevamente el enlace completo que recibiste. Por seguridad, no es posible continuar sin su token.</Alert>}
  </AccountShell>;
}

export function InvitationActivationScreen() { return <SecretPasswordFlow kind="invitation" />; }
export function ResetPasswordScreen() { return <SecretPasswordFlow kind="reset" />; }

export function ActivationCodeScreen() {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'form' | 'success'>('form');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const client = useMemo(() => publicIdentityClient(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) return;
    setLoading(true); setError(null);
    try {
      await client.completeActivation(username, code, password);
      setCode(''); setPassword(''); setConfirmation(''); setState('success');
    } catch (nextError) { setError(nextError); } finally { setLoading(false); }
  }

  return <AccountShell title="Activa tu acceso sin correo" description="Ingresa el usuario institucional y el código de un solo uso que te entregó la institución. Después define tu propia contraseña.">
    {state === 'success' ? <div className="account-success"><span aria-hidden="true">✓</span><h2>Cuenta activada</h2><p>El código ya fue consumido. Inicia sesión con tu usuario institucional.</p><Link className="button-link button-link--primary" href="/login">Ir al inicio de sesión</Link></div> : <form className="account-form" onSubmit={submit}>{error ? <Alert title={errorTitle(error)} tone="error">{identityErrorMessage(error)}</Alert> : null}<label className="account-field"><span>Usuario institucional</span><input autoCapitalize="none" autoComplete="username" maxLength={128} onChange={(event) => setUsername(event.target.value)} required value={username} /></label><label className="account-field"><span>Código de activación</span><input autoCapitalize="none" autoComplete="one-time-code" maxLength={1024} onChange={(event) => setCode(event.target.value)} required value={code} /></label><PasswordFields confirmation={confirmation} onConfirmation={setConfirmation} onPassword={setPassword} password={password} /><Button className="account-submit" disabled={password !== confirmation} loading={loading} type="submit">Activar mi cuenta</Button></form>}
  </AccountShell>;
}

export function ForgotPasswordScreen() {
  const [identifier, setIdentifier] = useState('');
  const [tenantHandle, setTenantHandle] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const client = useMemo(() => publicIdentityClient(), []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      await client.requestPasswordRecovery(identifier, tenantHandle || undefined);
      setAccepted(true); setIdentifier(''); setTenantHandle('');
    } catch (nextError) { setError(nextError); } finally { setLoading(false); }
  }

  return <AccountShell title="Recupera tu contraseña" description="Si existe una cuenta elegible con correo verificado, Identity enviará un enlace de recuperación. La respuesta es siempre privada y genérica.">
    {accepted ? <div className="account-success"><span aria-hidden="true">✓</span><h2>Solicitud recibida</h2><p>Si la cuenta puede recuperar acceso por correo, recibirás un mensaje con los siguientes pasos.</p><Link className="button-link button-link--primary" href="/login">Volver al inicio</Link></div> : <form className="account-form" onSubmit={submit}>{error ? <Alert title="No pudimos recibir la solicitud" tone="error">{identityErrorMessage(error)}</Alert> : null}<label className="account-field"><span>Usuario institucional o correo verificado</span><input autoComplete="username" maxLength={320} onChange={(event) => setIdentifier(event.target.value)} required value={identifier} /></label><label className="account-field"><span>Institución <small>(opcional)</small></span><input autoCapitalize="none" maxLength={128} onChange={(event) => setTenantHandle(event.target.value)} placeholder="colegio-conquistadores" value={tenantHandle} /></label><Button className="account-submit" loading={loading} type="submit">Solicitar recuperación</Button></form>}
  </AccountShell>;
}

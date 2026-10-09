import Link from 'next/link';
import { useId, type ReactNode } from 'react';

import { Icon } from '@/components/icons';

export function AccountShell({
  children,
  description,
  showBackLink = true,
  title,
}: {
  children: ReactNode;
  description: string;
  showBackLink?: boolean;
  title: string;
}) {
  return (
    <main className="account-page">
      <a className="skip-link" href="#account-content">
        Saltar al formulario
      </a>
      <section
        aria-labelledby="account-title"
        className="account-shell"
        id="account-content"
        tabIndex={-1}
      >
        <header className="account-brand">
          <span
            aria-hidden="true"
            className="account-brand__mark"
          >
            <Icon name="graduation-cap" />
          </span>
          <div>
            <strong>EduPay Académico</strong>
            <span>Acceso institucional</span>
          </div>
        </header>
        <div className="account-intro">
          <h1 id="account-title">{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </section>
      <aside className="account-assurance" aria-label="Protección de cuenta">
        <span className="account-assurance__mark" aria-hidden="true">
          <Icon name="check-circle" />
        </span>
        <div>
          <strong>Tu acceso pertenece a EduPay Identity.</strong>
          <p>
            Académico no guarda contraseñas, códigos de activación ni tokens de
            recuperación.
          </p>
        </div>
      </aside>
      {showBackLink ? (
        <footer className="account-footer">
          <Link href="/login">Volver al inicio de sesión</Link>
        </footer>
      ) : null}
    </main>
  );
}

export function PasswordFields({
  password,
  confirmation,
  onPassword,
  onConfirmation,
}: {
  password: string;
  confirmation: string;
  onPassword(value: string): void;
  onConfirmation(value: string): void;
}) {
  const passwordHelpId = useId();
  const confirmationHelpId = useId();
  const mismatchId = useId();
  const mismatch = Boolean(confirmation && password !== confirmation);
  return (
    <div className="account-password-fields">
      <label className="account-field">
        <span>Nueva contraseña</span>
        <input
          autoComplete="new-password"
          aria-describedby={passwordHelpId}
          maxLength={1024}
          minLength={12}
          onChange={(event) => onPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <small id={passwordHelpId}>
          Usa al menos 12 caracteres y evita caracteres de control. Identity
          realizará la validación final.
        </small>
      </label>
      <label className="account-field">
        <span>Confirmar contraseña</span>
        <input
          aria-invalid={mismatch}
          aria-describedby={
            mismatch
              ? `${confirmationHelpId} ${mismatchId}`
              : confirmationHelpId
          }
          autoComplete="new-password"
          maxLength={1024}
          minLength={12}
          onChange={(event) => onConfirmation(event.target.value)}
          required
          type="password"
          value={confirmation}
        />
        <small id={confirmationHelpId}>
          Repite la contraseña para confirmarla.
        </small>
        {mismatch ? (
          <small
            className="account-field__error"
            id={mismatchId}
            role="alert"
          >
            Las contraseñas no coinciden.
          </small>
        ) : null}
      </label>
    </div>
  );
}

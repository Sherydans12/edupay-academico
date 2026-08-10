import Link from 'next/link';
import type { ReactNode } from 'react';

export function AccountShell({ children, description, showBackLink = true, title }: { children: ReactNode; description: string; showBackLink?: boolean; title: string }) {
  return (
    <main className="account-page">
      <a className="skip-link" href="#account-content">Saltar al formulario</a>
      <section aria-labelledby="account-title" className="account-shell" id="account-content">
        <header className="account-brand">
          <div aria-label="Espacio para logo institucional aprobado" className="account-brand__mark" role="img">CC</div>
          <div><strong>Colegio Conquistadores</strong><span>EduPay Académico</span></div>
        </header>
        <div className="account-intro">
          <h1 id="account-title">{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </section>
      <aside className="account-assurance" aria-label="Protección de cuenta">
        <span aria-hidden="true">✓</span>
        <p><strong>Tu acceso pertenece a EduPay Identity.</strong> Académico no guarda contraseñas, códigos de activación ni tokens de recuperación.</p>
      </aside>
      {showBackLink ? <footer className="account-footer"><Link href="/login">Volver al inicio de sesión</Link></footer> : null}
    </main>
  );
}

export function PasswordFields({ password, confirmation, onPassword, onConfirmation }: {
  password: string;
  confirmation: string;
  onPassword(value: string): void;
  onConfirmation(value: string): void;
}) {
  const mismatch = Boolean(confirmation && password !== confirmation);
  return (
    <div className="account-password-fields">
      <label className="account-field">
        <span>Nueva contraseña</span>
        <input autoComplete="new-password" maxLength={1024} minLength={12} onChange={(event) => onPassword(event.target.value)} required type="password" value={password} />
        <small>Usa al menos 12 caracteres y evita caracteres de control. Identity realizará la validación final.</small>
      </label>
      <label className="account-field">
        <span>Confirmar contraseña</span>
        <input aria-invalid={mismatch} autoComplete="new-password" maxLength={1024} minLength={12} onChange={(event) => onConfirmation(event.target.value)} required type="password" value={confirmation} />
        {mismatch ? <small className="account-field__error" role="alert">Las contraseñas no coinciden.</small> : null}
      </label>
    </div>
  );
}

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

type ClassValue = string | false | null | undefined;

function classes(...values: ClassValue[]) {
  return values.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="ui-spinner" /> : null}
      {loading ? <span className="sr-only">Cargando</span> : children}
    </button>
  );
}

interface FieldProps {
  error?: string | undefined;
  hint?: string | undefined;
  label: string;
}

function FieldFrame({
  children,
  error,
  hint,
  id,
  label,
}: FieldProps & { children: ReactNode; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="ui-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ui-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <span hidden>{describedBy}</span>
    </div>
  );
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>,
    FieldProps {
  id: string;
}

export function Input({ error, hint, id, label, className, ...props }: InputProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <input
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={classes('ui-input', className)}
        id={id}
        {...props}
      />
    </FieldFrame>
  );
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    FieldProps {
  id: string;
}

export function Textarea({ error, hint, id, label, className, ...props }: TextareaProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <textarea
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={classes('ui-input', 'ui-textarea', className)}
        id={id}
        {...props}
      />
    </FieldFrame>
  );
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>,
    FieldProps {
  id: string;
}

export function Select({ error, hint, id, label, className, children, ...props }: SelectProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldFrame error={error} hint={hint} id={id} label={label}>
      <select
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={classes('ui-input', 'ui-select', className)}
        id={id}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  description?: string;
  label: string;
}

export function Checkbox({ className, description, id, label, ...props }: CheckboxProps) {
  return (
    <label className={classes('ui-checkbox', className)} htmlFor={id}>
      <input className="ui-checkbox__control" id={id} type="checkbox" {...props} />
      <span>
        <span className="ui-checkbox__label">{label}</span>
        {description ? <span className="ui-checkbox__description">{description}</span> : null}
      </span>
    </label>
  );
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'creative';

export function Badge({
  children,
  className,
  icon,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { icon?: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={classes('ui-badge', `ui-badge--${tone}`, className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={classes('ui-card', interactive && 'ui-card--interactive', className)} {...props}>
      {children}
    </div>
  );
}

export function Avatar({
  alt,
  className,
  name,
  size = 'md',
  src,
}: {
  alt?: string;
  className?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  src?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return src ? (
    // The shared package is framework-neutral; applications may pass optimized asset URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? name} className={classes('ui-avatar', `ui-avatar--${size}`, className)} src={src} />
  ) : (
    <span
      aria-label={name}
      className={classes('ui-avatar', `ui-avatar--${size}`, 'ui-avatar--fallback', className)}
      role="img"
    >
      {initials}
    </span>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={classes('ui-skeleton', className)} {...props} />;
}

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div className={classes('ui-empty-state', className)}>
      {icon ? <div className="ui-empty-state__icon">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </div>
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export function Alert({
  action,
  children,
  className,
  title,
  tone = 'info',
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  title: string;
  tone?: AlertTone;
}) {
  return (
    <div
      className={classes('ui-alert', `ui-alert--${tone}`, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div className="ui-alert__mark" aria-hidden="true" />
      <div className="ui-alert__body">
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="ui-alert__action">{action}</div> : null}
    </div>
  );
}

export function DataList({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div aria-label={label} className={classes('ui-data-list', className)} role="list">
      {children}
    </div>
  );
}

export function DataListItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={classes('ui-data-list__item', className)} role="listitem">
      {children}
    </div>
  );
}

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type TenantThemeName = 'default' | 'colegio-conquistadores';

export interface TenantThemeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  theme?: TenantThemeName;
}

export function TenantTheme({
  children,
  className = '',
  theme = 'default',
  ...props
}: TenantThemeProps) {
  return (
    <div
      className={`ui-theme ${className}`.trim()}
      data-tenant-theme={theme}
      {...props}
    >
      {children}
    </div>
  );
}

export type TenantThemeOverrides = Partial<
  Record<
    | '--brand-primary'
    | '--brand-primary-medium'
    | '--brand-primary-dark'
    | '--brand-accent'
    | '--brand-accent-hover'
    | '--brand-educational'
    | '--brand-creative'
    | '--surface-background'
    | '--surface-primary'
    | '--surface-secondary'
    | '--surface-selected'
    | '--border-default'
    | '--text-primary'
    | '--text-secondary'
    | '--state-success'
    | '--state-warning'
    | '--state-error'
    | '--focus-ring',
    string
  >
>;

export function createTenantThemeStyle(
  overrides: TenantThemeOverrides,
): CSSProperties {
  return overrides as CSSProperties;
}

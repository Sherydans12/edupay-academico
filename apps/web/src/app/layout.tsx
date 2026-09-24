import { TenantTheme } from '@edupay/ui';
import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';

import { IdentitySessionProvider } from '@/auth/session-provider';

import '@edupay/ui/styles.css';
import './globals.css';

const montserrat = Montserrat({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-montserrat',
});

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.ico',
  },
  title: 'EduPay Académico',
  description: 'Espacio académico para estudiantes, docentes y equipos.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body className={montserrat.variable}>
        <template
          data-design-contract="academic-learning-route"
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: EduPay Académico is a clear daily workspace for learners and institution teams.
OWN-WORLD: Neutral EduPay surfaces, institutional blue navigation, restrained attention color, Montserrat, and accessible controls.
STORY: People see their current institution, role, module, next task, and the record or course they are working in.
FIRST VIEWPORT: Keep context and role navigation compact, then prioritize the selected learning or casework content.
FORM: Reuse the documented EduPay design system; keep tenant identity in active session data and avoid school-specific branding in shared screens.
FINISH: Review shared navigation, role context, keyboard operation, narrow layouts, and the affected module flows.
-->`,
          }}
        />
        <TenantTheme theme="default">
          <IdentitySessionProvider>{children}</IdentitySessionProvider>
        </TenantTheme>
      </body>
    </html>
  );
}

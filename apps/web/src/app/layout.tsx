import { TenantTheme } from '@edupay/ui';
import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';

import '@edupay/ui/styles.css';
import './globals.css';

const montserrat = Montserrat({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-montserrat',
});

export const metadata: Metadata = {
  title: 'EduPay Académico · Colegio Conquistadores',
  description: 'Espacio académico de estudiantes y docentes',
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
THESIS: A calm educational operating environment organized around the next meaningful learning step, refusing the dense ERP dashboard.
OWN-WORLD: Warm paper-like neutral fields, institutional blue navigation, precise yellow attention cues, turquoise/purple learning accents, Montserrat, and tactile route markers.
STORY: Students immediately see what matters now and where learning continues; teachers immediately see what to prepare and review.
FIRST VIEWPORT: Compact institutional shell, clear greeting and next action, then a learning/work stream with deadlines and subject context visible without scrolling on common desktop sizes.
FORM: Operate mode; structured learning route pinned by the owner brief; seed key owner-pinned-conquistadores.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        <TenantTheme theme="colegio-conquistadores">{children}</TenantTheme>
      </body>
    </html>
  );
}

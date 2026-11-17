'use client';

import { useMemo } from 'react';
import {
  useTrustedCurrentSession,
  type TrustedCurrentSession,
} from '@/auth/current-session';
import { createAcademicApiClient } from '@/api/client-factory';
import type { AcademicApiClient } from '@/api/academic-client';
import { AppShell } from '@/components/app-shell';
import type { AccountProvisioningActions } from '@/components/account-provisioning';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

import { useAdminData, DataState, type AdminView } from './shared';
import { useAcademicYearContext, AcademicYearContextBar } from './year-context';
import { AdminOverview } from './overview';
import { CoursesView } from './courses';
import { EnrollmentsView } from './enrollments-view';
import { PeopleView } from './people';

const headings: Record<AdminView, { description: string; title: string }> = {
  overview: {
    description:
      'Lo que requiere atención en el año en contexto y lo que viene.',
    title: 'Inicio',
  },
  structure: {
    description:
      'Los cursos del año en contexto, con sus alumnos, asignaturas y profesores.',
    title: 'Cursos',
  },
  enrollments: {
    description:
      'Incorpora alumnos, matricula, avanza cursos y revisa casos pendientes.',
    title: 'Matrículas',
  },
  people: {
    description:
      'Fichas de alumnos y profesores, su curso del año y su acceso a la plataforma.',
    title: 'Personas',
  },
};

export function AcademicAdminScreen({
  api,
  dataMode = 'real',
  identityActions,
  session = demoSessions.admin,
  view,
}: {
  api?: AcademicApiClient;
  dataMode?: 'demo' | 'real';
  identityActions?: AccountProvisioningActions | undefined;
  session?: TrustedCurrentSession;
  view: AdminView;
}) {
  const client = useMemo(() => api ?? createAcademicApiClient(), [api]);
  const currentSession = useTrustedCurrentSession(session).session;
  const contextKey = `${currentSession.tenantId}:${currentSession.membershipId}`;
  const { data, error, loading, reload } = useAdminData(client, contextKey);
  const yearContext = useAcademicYearContext(data, currentSession.tenantId);
  // Saves refresh in the background so each screen keeps its tab, selected
  // course and filters while the shared data updates.
  const refresh = () => void reload({ background: true });
  const contextYear = yearContext.contextYear;

  return (
    <AppShell dataMode={dataMode} session={currentSession}>
      <PageHeading
        description={headings[view].description}
        title={headings[view].title}
      />
      <DataState error={error} loading={loading} onRetry={() => void reload()}>
        <AcademicYearContextBar
          contextYear={contextYear}
          contextYearId={yearContext.contextYearId}
          onChange={yearContext.chooseYear}
          years={yearContext.selectableYears}
        />
        {view === 'overview' ? (
          <AdminOverview
            api={client}
            contextYear={contextYear}
            data={data}
            onRetryPreparation={() => void reload()}
            onSaved={refresh}
          />
        ) : view === 'structure' ? (
          <CoursesView
            key={contextKey}
            api={client}
            contextYear={contextYear}
            data={data}
            onContextYearChange={yearContext.chooseYear}
            onSaved={refresh}
          />
        ) : view === 'enrollments' ? (
          <EnrollmentsView
            key={contextKey}
            api={client}
            contextYear={contextYear}
            data={data}
            onSaved={refresh}
          />
        ) : (
          <PeopleView
            key={contextKey}
            api={client}
            academicYear={
              contextYear
                ? { id: contextYear.id, label: contextYear.label }
                : undefined
            }
            data={data}
            identityActions={identityActions}
            onPeopleSaved={refresh}
          />
        )}
      </DataState>
    </AppShell>
  );
}

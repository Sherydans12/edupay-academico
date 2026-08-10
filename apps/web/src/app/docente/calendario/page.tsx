'use client';

import { AppShell } from '@/components/app-shell';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';
import { useTrustedCurrentSession } from '@/auth/current-session';

export default function TeacherCalendarPage() { const session = useTrustedCurrentSession(demoSessions.teacher).session; return <AppShell session={session}><PageHeading description="La navegación responsive está preparada; este flujo se implementará con el backend académico." title="Calendario" /></AppShell>; }

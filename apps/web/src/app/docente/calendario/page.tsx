import { AppShell } from '@/components/app-shell';
import { PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

export default function TeacherCalendarPage() { return <AppShell session={demoSessions.teacher}><PageHeading description="La navegación responsive está preparada; este flujo se implementará con el backend académico." title="Calendario" /></AppShell>; }

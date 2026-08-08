import { Alert, Button, Card } from '@edupay/ui';

import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { CompactStat, PageHeading } from '@/components/page-primitives';
import { demoSessions } from '@/demo/demo-data';

export function AdminOverviewScreen() {
  return (
    <AppShell session={demoSessions.admin}>
      <PageHeading description="Representación ligera del espacio de configuración académica del tenant." title="Administración académica" />
      <Alert title="Separación de responsabilidades" tone="info">Este espacio no administra credenciales ni sesiones. Los flujos de membresía e invitación pertenecerán a EduPay Identity.</Alert>
      <div className="compact-stats">
        <CompactStat icon="people" label="estudiantes configurados" value="248" />
        <CompactStat icon="book" label="asignaturas activas" value="18" />
        <CompactStat icon="calendar" label="año académico" value="2026" />
      </div>
      <section className="admin-foundation">
        <Card><span><Icon name="layers" /></span><div><h2>Estructura académica</h2><p>Años, cursos, asignaturas y relaciones académicas del tenant.</p></div><Button disabled variant="secondary">Próxima fase</Button></Card>
        <Card><span><Icon name="people" /></span><div><h2>Personas y asignaciones</h2><p>Registros académicos de estudiantes y docentes, separados de Identity.</p></div><Button disabled variant="secondary">Próxima fase</Button></Card>
        <Card><span><Icon name="settings" /></span><div><h2>Configuración del espacio</h2><p>Tema semántico, terminología y preferencias académicas aprobadas.</p></div><Button disabled variant="secondary">Próxima fase</Button></Card>
      </section>
    </AppShell>
  );
}

export function AdminPlaceholderScreen({ title }: { title: string }) {
  return (
    <AppShell session={demoSessions.admin}>
      <PageHeading description="Navegación de administración preparada sin implementar dominio ni persistencia académica." title={title} />
      <Alert title="Representación de frontend" tone="info">Este espacio valida la jerarquía y el comportamiento responsive. Sus operaciones permanecerán inactivas hasta contar con contratos y autorización del backend.</Alert>
    </AppShell>
  );
}

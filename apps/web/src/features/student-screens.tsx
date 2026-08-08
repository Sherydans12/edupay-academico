import { Alert, Avatar, Badge, Button, Card } from '@edupay/ui';
import Link from 'next/link';

import { Icon } from '@/components/icons';
import { AppShell } from '@/components/app-shell';
import { LearningRoute, PageHeading, SubjectCard } from '@/components/page-primitives';
import { UploadDemo } from '@/components/upload-demo';
import { demoSessions, languageUnits, studentAttention, studentSubjects } from '@/demo/demo-data';

export function StudentDashboardScreen() {
  return (
    <AppShell session={demoSessions.student}>
      <PageHeading description="Sábado 8 de agosto · Aquí tienes un camino claro para continuar." title="Hola, Sofía" />

      <section aria-labelledby="next-title" className="student-next">
        <div className="student-next__copy">
          <Badge tone="warning"><Icon name="clock" />Vence mañana</Badge>
          <h2 id="next-title">Tu próximo paso: terminar la reseña literaria</h2>
          <p>Lenguaje y Comunicación · Prof. Camila Rojas</p>
          <Link className="button-link button-link--accent" href="/estudiante/asignaturas/lenguaje/resena-literaria">
            Continuar actividad <Icon name="chevron-right" />
          </Link>
        </div>
        <div className="student-next__route" aria-label="Progreso de la unidad">
          <div className="route-step route-step--done"><Icon name="check" /><span>Leer</span></div>
          <span />
          <div className="route-step route-step--done"><Icon name="check" /><span>Planificar</span></div>
          <span />
          <div className="route-step route-step--active"><Icon name="document" /><span>Entregar</span></div>
        </div>
      </section>

      <div className="dashboard-layout">
        <section aria-labelledby="attention-title" className="content-section">
          <div className="section-heading"><div><h2 id="attention-title">Necesita tu atención</h2><p>Ordenado por lo que conviene resolver primero.</p></div></div>
          <div className="attention-list">
            {studentAttention.map((item) => (
              <Link className="attention-row" href={item.href} key={item.id}>
                <span className={`attention-mark attention-mark--${item.tone}`}><Icon name={item.tone === 'success' ? 'spark' : item.tone === 'warning' ? 'clock' : 'clipboard'} /></span>
                <span className="attention-copy"><small>{item.subject}</small><strong>{item.title}</strong><span>{item.due}</span></span>
                <Badge tone={item.tone}>{item.badge}</Badge>
                <Icon className="attention-chevron" name="chevron-right" />
              </Link>
            ))}
          </div>
        </section>

        <aside className="teacher-note">
          <Avatar name="Camila Rojas" size="lg" />
          <div><h2>Un mensaje para el curso</h2><p>“Recuerden que una reseña comparte una opinión y también ayuda a otro lector a decidir.”</p><small>Prof. Camila Rojas · Lenguaje</small></div>
        </aside>
      </div>

      <section aria-labelledby="subjects-title" className="content-section subject-preview">
        <div className="section-heading"><div><h2 id="subjects-title">Tus asignaturas</h2><p>Retoma cada ruta desde el último punto en que estuviste.</p></div><Link href="/estudiante/asignaturas">Ver todas <Icon name="chevron-right" /></Link></div>
        <div className="subject-grid">{studentSubjects.map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div>
      </section>
    </AppShell>
  );
}

export function StudentSubjectsScreen() {
  return (
    <AppShell session={demoSessions.student}>
      <PageHeading description="Tus rutas de aprendizaje activas para 7º Básico A." title="Asignaturas" />
      <Alert title="Continuidad visible" tone="info">El porcentaje resume cuánto de la ruta publicada ya visitaste; no representa una calificación.</Alert>
      <div className="subject-grid subject-grid--overview">{studentSubjects.map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div>
    </AppShell>
  );
}

export function StudentSubjectScreen() {
  return (
    <AppShell session={demoSessions.student}>
      <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/estudiante/asignaturas">Asignaturas</Link><Icon name="chevron-right" /><span>Lenguaje y Comunicación</span></nav>
      <section className="subject-hero">
        <div className="subject-hero__mark">LEN</div>
        <div><h1>Lenguaje y Comunicación</h1><p>7º Básico A · Prof. Camila Rojas y Prof. Paula Medina</p></div>
        <div className="subject-hero__progress"><span>Continuidad de la ruta</span><strong>68%</strong><div className="progress-track"><span style={{ width: '68%' }} /></div></div>
      </section>
      <div className="route-intro"><div><h2>Tu ruta de aprendizaje</h2><p>Avanza unidad por unidad. Lo más importante aparece destacado en el camino.</p></div><Badge tone="warning"><Icon name="clock" />1 entrega próxima</Badge></div>
      <LearningRoute audience="student" units={languageUnits} />
    </AppShell>
  );
}

export function StudentAssignmentScreen() {
  return (
    <AppShell session={demoSessions.student}>
      <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/estudiante/asignaturas">Asignaturas</Link><Icon name="chevron-right" /><Link href="/estudiante/asignaturas/lenguaje">Lenguaje</Link><Icon name="chevron-right" /><span>Mi reseña literaria</span></nav>
      <div className="assignment-layout">
        <article className="assignment-content">
          <div className="assignment-title"><Badge tone="warning"><Icon name="clock" />Vence mañana, 20:00</Badge><h1>Mi reseña literaria</h1><p>Comparte una lectura personal y orienta a otro lector con argumentos claros.</p></div>
          <section><h2>Qué debes hacer</h2><ol className="instruction-list"><li><span>1</span><div><strong>Presenta el libro</strong><p>Incluye título, autor y una breve idea del contexto, sin revelar el final.</p></div></li><li><span>2</span><div><strong>Explica tu opinión</strong><p>Desarrolla dos razones y apóyalas con ejemplos de la lectura.</p></div></li><li><span>3</span><div><strong>Cierra con una recomendación</strong><p>Cuenta a qué tipo de lector se lo recomendarías y por qué.</p></div></li></ol></section>
          <section><h2>Material de apoyo</h2><a className="resource-row" href="#material-demo"><span><Icon name="document" /></span><span><strong>Guía para escribir una reseña.pdf</strong><small>PDF · material de demostración</small></span><Icon name="download" /></a></section>
          <Alert title="Sobre la entrega" tone="warning">La plataforma aceptará trabajos después del plazo y mostrará su condición de atraso. La hora final será determinada por el servidor.</Alert>
        </article>
        <aside><UploadDemo /></aside>
      </div>
    </AppShell>
  );
}

export function StudentPlaceholderScreen({ title }: { title: string }) {
  return (
    <AppShell session={demoSessions.student}>
      <PageHeading description="Esta navegación está preparada para una fase posterior del MVP." title={title} />
      <Card className="placeholder-panel"><Icon name="layers" /><h2>Fundación lista</h2><p>La ruta existe para validar el shell responsive, pero su flujo aún no está implementado ni conectado a datos académicos.</p><Button disabled>Disponible más adelante</Button></Card>
    </AppShell>
  );
}

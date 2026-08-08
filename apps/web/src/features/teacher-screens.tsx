import { Avatar, Badge, Button, Card, Tabs, Textarea } from '@edupay/ui';
import Link from 'next/link';

import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { CompactStat, LearningRoute, PageHeading, SubjectCard } from '@/components/page-primitives';
import { demoSessions, languageUnits, submissions, teacherSubjects } from '@/demo/demo-data';

export function TeacherDashboardScreen() {
  return (
    <AppShell session={demoSessions.teacher}>
      <PageHeading action={<Link className="button-link button-link--primary" href="/docente/asignaturas/lenguaje"><Icon name="plus" />Crear contenido</Link>} description="Sábado 8 de agosto · Tus prioridades de enseñanza en un solo lugar." title="Buenos días, Camila" />
      <div className="compact-stats">
        <CompactStat icon="book" label="asignaturas activas" value="3" />
        <CompactStat icon="review" label="entregas por revisar" value="7" />
        <CompactStat icon="calendar" label="plazos esta semana" value="4" />
      </div>
      <div className="teacher-dashboard-grid">
        <section aria-labelledby="reviews-title" className="content-section teacher-review-queue">
          <div className="section-heading"><div><h2 id="reviews-title">Revisiones pendientes</h2><p>Trabajo reciente de tus asignaturas autorizadas.</p></div><Link href="/docente/revisiones">Ver todas <Icon name="chevron-right" /></Link></div>
          <div className="submission-list">
            {submissions.slice(0, 3).map((submission) => (
              <Link className="submission-row" href={submission.id === 'submission-1' ? '/docente/revisiones/emilia-vargas' : '/docente/revisiones'} key={submission.id}>
                <Avatar name={submission.student} />
                <span><strong>{submission.student}</strong><small>{submission.title} · {submission.course}</small></span>
                <span className="submission-time">{submission.submittedAt}<small>{submission.fileCount} archivo{submission.fileCount > 1 ? 's' : ''}</small></span>
                <Badge tone={submission.status === 'late' ? 'warning' : 'info'}>{submission.status === 'late' ? 'Con atraso' : 'Por revisar'}</Badge>
                <Icon name="chevron-right" />
              </Link>
            ))}
          </div>
        </section>
        <aside className="week-plan">
          <h2>Próximos hitos</h2>
          <div><span>10</span><p><strong>Cierre reseña literaria</strong><small>7º A · mañana, 20:00</small></p></div>
          <div><span>12</span><p><strong>Publicar unidad 3</strong><small>7º B · martes</small></p></div>
          <div><span>14</span><p><strong>Evaluación de lectura</strong><small>7º A · jueves</small></p></div>
        </aside>
      </div>
      <section aria-labelledby="teacher-subjects-title" className="content-section">
        <div className="section-heading"><div><h2 id="teacher-subjects-title">Tus espacios de enseñanza</h2><p>Contenido, estudiantes y revisiones por asignatura.</p></div><Link href="/docente/asignaturas">Ver asignaturas <Icon name="chevron-right" /></Link></div>
        <div className="subject-grid">{teacherSubjects.map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div>
      </section>
    </AppShell>
  );
}

export function TeacherSubjectsScreen() {
  return (
    <AppShell session={demoSessions.teacher}>
      <PageHeading action={<Button disabled><Icon name="plus" />Nuevo contenido</Button>} description="Solo se muestran asignaturas asociadas a tu contexto docente de demostración." title="Asignaturas" />
      <div className="subject-grid subject-grid--overview">{teacherSubjects.map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div>
    </AppShell>
  );
}

export function TeacherSubjectScreen() {
  const authoringUnits = languageUnits.map((unit) => ({ ...unit, items: unit.items.map((item) => item.id === 'item-7' ? { ...item, state: 'draft' as const, description: 'Borrador · visible solo para docentes' } : item) }));
  return (
    <AppShell session={demoSessions.teacher}>
      <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/docente/asignaturas">Asignaturas</Link><Icon name="chevron-right" /><span>Lenguaje y Comunicación · 7º A</span></nav>
      <section className="teacher-subject-header">
        <div><div className="subject-hero__mark">LEN</div><div><h1>Lenguaje y Comunicación</h1><p>7º Básico A · 32 estudiantes · 2 docentes</p></div></div>
        <div className="header-actions"><Button disabled variant="secondary"><Icon name="people" />Ver estudiantes</Button><Button disabled><Icon name="plus" />Nuevo contenido</Button></div>
      </section>
      <Tabs label="Secciones de la asignatura" items={[
        { id: 'content', label: 'Ruta y contenido', content: <><div className="authoring-toolbar"><div><h2>Ruta de aprendizaje</h2><p>Organiza materiales y actividades manteniendo el recorrido visible.</p></div><Badge tone="info">Vista docente</Badge></div><LearningRoute audience="teacher" units={authoringUnits} /></> },
        { id: 'submissions', label: 'Entregas (5)', content: <div className="submission-list">{submissions.slice(0,3).map((submission) => <div className="submission-row" key={submission.id}><Avatar name={submission.student} /><span><strong>{submission.student}</strong><small>{submission.title}</small></span><span className="submission-time">{submission.submittedAt}</span><Badge tone="info">Por revisar</Badge></div>)}</div> },
        { id: 'team', label: 'Equipo docente', content: <Card className="team-panel"><Avatar name="Camila Rojas" /><div><strong>Camila Rojas</strong><small>Docente asignada</small></div><Avatar name="Paula Medina" /><div><strong>Paula Medina</strong><small>Docente colaboradora</small></div></Card> },
      ]} />
    </AppShell>
  );
}

export function SubmissionReviewScreen() {
  return (
    <AppShell session={demoSessions.teacher}>
      <nav aria-label="Ruta de navegación" className="breadcrumbs"><Link href="/docente/revisiones">Revisiones</Link><Icon name="chevron-right" /><span>Emilia Vargas</span></nav>
      <div className="review-layout">
        <article className="review-document">
          <div className="document-toolbar"><div><Icon name="document" /><span><strong>Reseña_Emilia_Vargas.pdf</strong><small>Documento de demostración · 1,8 MB</small></span></div><Button disabled size="sm" variant="secondary"><Icon name="download" />Descargar</Button></div>
          <div className="document-preview" aria-label="Vista previa simulada del documento">
            <div><span>Mi reseña literaria</span><h2>La historia que aprendió a volar</h2><p>Una lectura sobre la amistad, la valentía y las decisiones que nos ayudan a crecer.</p><hr/><p>El relato acompaña a una protagonista que descubre que pedir ayuda también puede ser una forma de valentía. Recomendaría este libro a quienes disfrutan las historias de aventura con personajes cercanos.</p><p>Lo que más me gustó fue la forma en que cada decisión cambia la relación entre los personajes...</p></div>
          </div>
        </article>
        <aside className="review-panel">
          <div className="review-student"><Avatar name="Emilia Vargas" size="lg" /><div><h1>Emilia Vargas</h1><p>7º Básico A · entregado hoy, 09:18</p></div></div>
          <Badge tone="info">Pendiente de revisión</Badge>
          <div className="review-files"><strong>2 archivos recibidos</strong><button disabled type="button"><Icon name="document" />Reseña_Emilia_Vargas.pdf</button><button disabled type="button"><Icon name="paperclip" />Portada_reseña.jpg</button></div>
          <Textarea id="teacher-feedback" label="Comentario para la estudiante" placeholder="Escribe observaciones claras y una próxima acción…" />
          <div className="review-actions"><Button disabled variant="secondary">Solicitar cambios</Button><Button disabled>Registrar revisión</Button></div>
          <p className="integration-note"><Icon name="settings" />Acciones desactivadas en la demostración. La semántica final de revisión sigue pendiente de decisión.</p>
        </aside>
      </div>
    </AppShell>
  );
}

export function TeacherReviewsScreen() {
  return (
    <AppShell session={demoSessions.teacher}>
      <PageHeading description="Entregas visibles solo dentro de las asignaturas docentes asignadas." title="Revisiones" />
      <div className="submission-list submission-list--panel">{submissions.map((submission) => <Link className="submission-row" href={submission.id === 'submission-1' ? '/docente/revisiones/emilia-vargas' : '/docente/revisiones'} key={submission.id}><Avatar name={submission.student}/><span><strong>{submission.student}</strong><small>{submission.title} · {submission.course}</small></span><span className="submission-time">{submission.submittedAt}<small>{submission.fileCount} archivo{submission.fileCount > 1 ? 's' : ''}</small></span><Badge tone={submission.status === 'late' ? 'warning' : submission.status === 'reviewed' ? 'success' : 'info'}>{submission.status === 'late' ? 'Con atraso' : submission.status === 'reviewed' ? 'Revisado' : 'Por revisar'}</Badge><Icon name="chevron-right" /></Link>)}</div>
    </AppShell>
  );
}

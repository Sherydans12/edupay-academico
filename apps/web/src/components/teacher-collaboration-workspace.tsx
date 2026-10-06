'use client';

import { Badge, Card } from '@edupay/ui';
import Link from 'next/link';

import { Icon } from '@/components/icons';

export interface TeacherCollaborationWorkspaceProps {
  courseSubjectId: string;
  courseName: string;
  subjectName: string;
  teacherName?: string;
  totalUnits?: number;
  totalItems?: number;
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  if (first && second) {
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  }
  return (name.slice(0, 2) || 'DC').toUpperCase();
}

export function TeacherCollaborationWorkspace({
  courseSubjectId,
  courseName,
  subjectName,
  teacherName = 'Docente Titular',
  totalUnits = 0,
  totalItems = 0,
}: TeacherCollaborationWorkspaceProps) {
  const initials = nameInitials(teacherName);

  return (
    <div className="teacher-collaboration-workspace">
      {/* 1. Hero Card */}
      <div className="collab-hero-card">
        <div className="collab-hero-card__main">
          <div className="collab-hero-card__icon" aria-hidden="true">
            <Icon name="users" />
          </div>
          <div className="collab-hero-card__text">
            <div className="collab-hero-card__title-row">
              <h3>Espacio de Colaboración Pedagógica</h3>
              <Badge tone="success">
                <span className="status-dot status-dot--active" /> Co-docencia activa
              </Badge>
            </div>
            <p className="collab-hero-card__subtitle">
              <strong>{subjectName}</strong> · {courseName}
            </p>
            <p className="collab-hero-card__desc">
              Este espacio de trabajo es compartido entre los docentes y profesionales de apoyo pedagógico asignados a la asignatura. Cualquier cambio en unidades, contenidos o rúbricas es colaborativo y visible en tiempo real para todo el equipo.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Team Members Section */}
      <section className="collab-section" aria-labelledby="collab-team-heading">
        <div className="collab-section__heading">
          <div>
            <h3 id="collab-team-heading">Equipo pedagógico asignado</h3>
            <p>Profesionales con acceso docente y de acompañamiento curricular en este curso.</p>
          </div>
          <Badge tone="info">2 roles activos</Badge>
        </div>

        <div className="collab-team-grid">
          {/* Docente Titular */}
          <Card className="collab-member-card collab-member-card--primary">
            <div className="collab-member-card__header">
              <span className="collab-member-card__avatar" aria-hidden="true">
                {initials}
              </span>
              <div className="collab-member-card__identity">
                <h4>{teacherName}</h4>
                <Badge tone="info">Docente Titular</Badge>
              </div>
            </div>
            <ul className="collab-member-card__roles">
              <li>
                <Icon name="check-circle" />
                <span>Planificación y estructuración curricular del curso</span>
              </li>
              <li>
                <Icon name="check-circle" />
                <span>Edición de temas, borradores y publicación oficial</span>
              </li>
              <li>
                <Icon name="check-circle" />
                <span>Calificación de tareas y cierre de evaluaciones</span>
              </li>
            </ul>
            <div className="collab-member-card__footer">
              <span className="collab-member-status">
                <span className="status-dot status-dot--active" /> Sesión activa
              </span>
            </div>
          </Card>

          {/* Co-docencia / Apoyo */}
          <Card className="collab-member-card">
            <div className="collab-member-card__header">
              <span className="collab-member-card__avatar collab-member-card__avatar--support" aria-hidden="true">
                AP
              </span>
              <div className="collab-member-card__identity">
                <h4>Equipo de Apoyo y Co-docencia</h4>
                <Badge tone="neutral">Acompañamiento en Aula</Badge>
              </div>
            </div>
            <ul className="collab-member-card__roles">
              <li>
                <Icon name="check-circle" />
                <span>Monitoreo de participación y retroalimentación formativa</span>
              </li>
              <li>
                <Icon name="check-circle" />
                <span>Adecuaciones curriculares y apoyo inclusivo (PIE)</span>
              </li>
              <li>
                <Icon name="check-circle" />
                <span>Seguimiento de entregas y orientación pedagógica</span>
              </li>
            </ul>
            <div className="collab-member-card__footer">
              <span className="collab-member-status">
                <span className="status-dot status-dot--active" /> Acceso habilitado
              </span>
            </div>
          </Card>
        </div>

        {/* Administrative notice */}
        <div className="collab-admin-notice">
          <Icon name="alert-circle" />
          <p>
            ¿Necesitas registrar un reemplazo, profesor adjunto o asistente de aula? Las vinculaciones docentes son administradas institucionalmente por la Dirección Académica o UTP del establecimiento.
          </p>
        </div>
      </section>

      {/* 3. Pedagogical Pillars */}
      <section className="collab-section" aria-labelledby="collab-pillars-heading">
        <div className="collab-section__heading">
          <div>
            <h3 id="collab-pillars-heading">Ámbitos de trabajo conjunto</h3>
            <p>Mecanismos que resguardan la coherencia curricular y la equidad formativa.</p>
          </div>
        </div>

        <div className="collab-pillars-grid">
          <div className="collab-pillar-card">
            <div className="collab-pillar-card__icon" aria-hidden="true">
              <Icon name="book-open" />
            </div>
            <h4>Planificación compartida</h4>
            <p>
              Actualmente hay {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'} y {totalItems} {totalItems === 1 ? 'contenido pedagógico' : 'contenidos pedagógicos'} sincronizados. El equipo comparte la misma visión de la ruta de aprendizaje.
            </p>
            <span className="collab-pillar-card__tag">Sincronización en tiempo real</span>
          </div>

          <div className="collab-pillar-card">
            <div className="collab-pillar-card__icon" aria-hidden="true">
              <Icon name="award" />
            </div>
            <h4>Criterios y pautas unificadas</h4>
            <p>
              Las rúbricas, escalas de evaluación y fechas límite aplican de forma estándar para todos los estudiantes, garantizando justicia evaluativa y consistencia en las calificaciones.
            </p>
            <span className="collab-pillar-card__tag">Criterios homogéneos</span>
          </div>

          <div className="collab-pillar-card">
            <div className="collab-pillar-card__icon" aria-hidden="true">
              <Icon name="history" />
            </div>
            <h4>Trazabilidad y control de cambios</h4>
            <p>
              Cada edición y publicación conserva el registro inmutable del docente autor y la fecha, permitiendo consultar versiones históricas y revertir cambios en caso de necesidad.
            </p>
            <span className="collab-pillar-card__tag">Historial con auditoría</span>
          </div>
        </div>
      </section>

      {/* 4. Roster CTA Banner */}
      <div className="collab-roster-cta">
        <div className="collab-roster-cta__info">
          <div className="collab-roster-cta__icon" aria-hidden="true">
            <Icon name="people" />
          </div>
          <div>
            <h4>Nómina de estudiantes con acceso</h4>
            <p>
              Consulta la matrícula oficial y los estudiantes con acceso reconocido para esta asignatura.
            </p>
          </div>
        </div>
        <Link
          className="button-link button-link--primary collab-roster-cta__action"
          href={`/docente/asignaturas/${courseSubjectId}/estudiantes`}
        >
          <Icon name="people" />
          <span>Ver estudiantes</span>
          <Icon name="chevron-right" />
        </Link>
      </div>
    </div>
  );
}

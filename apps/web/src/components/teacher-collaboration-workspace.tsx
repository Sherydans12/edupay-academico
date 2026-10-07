'use client';

import { Card } from '@edupay/ui';
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

export function TeacherCollaborationWorkspace({
  courseSubjectId,
  courseName,
  subjectName,
}: TeacherCollaborationWorkspaceProps) {
  return (
    <Card className="teacher-collaboration-workspace">
      <section aria-labelledby="teacher-team-heading">
        <div className="teacher-profile-section-card__title">
          <Icon name="people" />
          <h2 id="teacher-team-heading">Equipo docente</h2>
        </div>
        <p>
          {subjectName} · {courseName}
        </p>
        <div className="collab-admin-notice" role="note">
          <Icon name="alert-circle" />
          <p>
            La nómina de docentes colaboradores no está disponible en este
            espacio. Las asignaciones de equipo se gestionan institucionalmente.
          </p>
        </div>
        <Link
          className="button-link button-link--secondary"
          href={`/docente/asignaturas/${courseSubjectId}/estudiantes`}
        >
          <Icon name="people" /> Consultar estudiantes asignados
        </Link>
      </section>
    </Card>
  );
}

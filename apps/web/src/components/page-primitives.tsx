import { Badge, Card } from '@edupay/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/icons';
import type {
  LearningItemKind,
  LearningItemState,
  LearningUnitViewModel,
  SubjectViewModel,
} from '@/demo/demo-data';

const itemMeta: Record<LearningItemKind, { icon: 'book' | 'clipboard' | 'document' | 'message'; label: string }> = {
  announcement: { icon: 'message', label: 'Anuncio' },
  assessment: { icon: 'document', label: 'Evaluación en documento' },
  assignment: { icon: 'clipboard', label: 'Actividad' },
  material: { icon: 'book', label: 'Material' },
};

const stateMeta: Record<LearningItemState, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  attention: { label: 'Requiere atención', tone: 'warning' },
  complete: { label: 'Visto', tone: 'success' },
  current: { label: 'En curso', tone: 'info' },
  draft: { label: 'Borrador visual', tone: 'neutral' },
  upcoming: { label: 'Próximamente', tone: 'neutral' },
};

export function PageHeading({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-heading__action">{action}</div> : null}
    </header>
  );
}

export function SubjectCard({ subject }: { subject: SubjectViewModel }) {
  return (
    <Link className={`subject-card subject-card--${subject.accent}`} href={subject.href}>
      <div className="subject-card__head">
        <span className="subject-code">{subject.code}</span>
        <Icon name="chevron-right" />
      </div>
      <div className="subject-card__body">
        <h3>{subject.title}</h3>
        <p>{subject.teacher}</p>
      </div>
      <div className="subject-progress">
        <div><span>Continuidad</span><strong>{subject.progress}%</strong></div>
        <div aria-label={`${subject.progress}% de continuidad`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={subject.progress} className="progress-track" role="progressbar">
          <span style={{ width: `${subject.progress}%` }} />
        </div>
      </div>
      <p className="subject-card__next">{subject.nextAction}</p>
    </Link>
  );
}

export function LearningRoute({
  audience,
  units,
}: {
  audience: 'student' | 'teacher';
  units: LearningUnitViewModel[];
}) {
  return (
    <div className="learning-route">
      {units.map((unit, unitIndex) => (
        <section className="learning-unit" key={unit.id}>
          <div className="learning-unit__marker" aria-hidden="true">
            <span>{unitIndex + 1}</span>
          </div>
          <div className="learning-unit__content">
            <header>
              <div>
                <h2>{unit.title}</h2>
                <p>{unit.description}</p>
              </div>
              <Badge tone={unitIndex === 1 ? 'info' : 'neutral'}>{unit.progressLabel}</Badge>
            </header>
            <div className="learning-items">
              {unit.items.map((item) => {
                const kind = itemMeta[item.kind];
                const state = stateMeta[item.state];
                const href = audience === 'student' && item.id === 'item-6'
                  ? '/estudiante/asignaturas/lenguaje/resena-literaria'
                  : audience === 'teacher' && item.id === 'item-6'
                    ? '/docente/asignaturas/lenguaje'
                    : undefined;
                const content = (
                  <>
                    <span className={`learning-item__icon learning-item__icon--${item.kind}`}><Icon name={kind.icon} /></span>
                    <span className="learning-item__copy">
                      <small>{kind.label}</small>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>
                    <span className="learning-item__meta">
                      <Badge tone={state.tone}>{state.label}</Badge>
                      {item.dueLabel ? <small><Icon name="clock" />{item.dueLabel}</small> : null}
                    </span>
                    {href ? <Icon className="learning-item__chevron" name="chevron-right" /> : null}
                  </>
                );
                return href ? (
                  <Link className="learning-item" href={href} key={item.id}>{content}</Link>
                ) : (
                  <div className="learning-item" key={item.id}>{content}</div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export function CompactStat({ icon, label, value }: { icon: 'book' | 'people' | 'review' | 'calendar'; label: string; value: string }) {
  return (
    <Card className="compact-stat">
      <span><Icon name={icon} /></span>
      <div><strong>{value}</strong><small>{label}</small></div>
    </Card>
  );
}

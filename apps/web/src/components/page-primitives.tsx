import { Badge, Card } from '@edupay/ui';
import type { CourseSubjectLearningRoute, LearningItem, LearningUnitWithItems } from '@edupay/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/icons';

type ItemIconName = 'book' | 'clipboard' | 'document' | 'message';

const itemMeta: Record<LearningItem['type'], { icon: ItemIconName; label: string }> = {
  ANNOUNCEMENT: { icon: 'message', label: 'Anuncio' },
  ASSESSMENT: { icon: 'document', label: 'Evaluación en documento' },
  ASSIGNMENT: { icon: 'clipboard', label: 'Actividad' },
  MATERIAL: { icon: 'book', label: 'Material' },
};

const publicationMeta: Record<LearningItem['publicationStatus'], { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  ARCHIVED: { label: 'Archivado', tone: 'neutral' },
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'Publicado', tone: 'success' },
  SCHEDULED: { label: 'Programado', tone: 'info' },
};

export interface SubjectCardViewModel {
  accent: 'blue' | 'turquoise' | 'purple' | 'yellow';
  code: string;
  href: string;
  id: string;
  subtitle: string;
  title: string;
  routeLabel?: string;
}

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

export function SubjectCard({ subject }: { subject: SubjectCardViewModel }) {
  return (
    <Link className={`subject-card subject-card--${subject.accent}`} href={subject.href}>
      <div className="subject-card__head">
        <span className="subject-code">{subject.code}</span>
        <Icon name="chevron-right" />
      </div>
      <div className="subject-card__body">
        <h3>{subject.title}</h3>
        <p>{subject.subtitle}</p>
      </div>
      <div className="subject-card__route">
        <span><Icon name="layers" />Ruta de aprendizaje</span>
        <strong>{subject.routeLabel ?? 'Abrir espacio'}</strong>
      </div>
    </Link>
  );
}

function itemDescription(item: LearningItem) {
  return item.description ?? item.instructions ?? item.body ?? item.content ?? 'Contenido disponible en este espacio.';
}

function formatDueAt(value: string) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isEffectivelyVisible(item: LearningItem, now = Date.now()) {
  return item.publicationStatus === 'PUBLISHED' ||
    (item.publicationStatus === 'SCHEDULED' && item.publishAt !== null && new Date(item.publishAt).getTime() <= now);
}

function itemStatus(item: LearningItem, audience: 'student' | 'teacher') {
  if (audience === 'student' && item.publicationStatus === 'SCHEDULED' && isEffectivelyVisible(item)) {
    return { label: 'Disponible', tone: 'success' as const };
  }
  return publicationMeta[item.publicationStatus];
}

export function LearningRoute({
  audience,
  courseSubjectId,
  onItemSelect,
  onUnitSelect,
  units,
}: {
  audience: 'student' | 'teacher';
  courseSubjectId?: string;
  onItemSelect?: (item: LearningItem, unit: LearningUnitWithItems) => ReactNode;
  onUnitSelect?: (unit: LearningUnitWithItems, index: number) => ReactNode;
  units: CourseSubjectLearningRoute['units'];
}) {
  const visibleUnits = audience === 'student'
    ? units.filter((unit) => unit.status === 'ACTIVE')
    : units;

  return (
    <div className="learning-route">
      {visibleUnits.map((unit, unitIndex) => {
        const visibleItems = audience === 'student' ? unit.items.filter((item) => isEffectivelyVisible(item)) : unit.items;
        return (
          <section className="learning-unit" key={unit.id}>
            <div className="learning-unit__marker" aria-hidden="true">
              <span>{unitIndex + 1}</span>
            </div>
            <div className="learning-unit__content">
              <header>
                <div>
                  <h2>{unit.title}</h2>
                  <p>{unit.description ?? 'Sin descripción para esta unidad.'}</p>
                </div>
                <div className="learning-unit__header-actions">
                  <Badge tone={unit.status === 'ACTIVE' ? 'info' : 'neutral'}>
                    {unit.status === 'ACTIVE' ? `${visibleItems.length} contenido${visibleItems.length === 1 ? '' : 's'}` : unit.status === 'DRAFT' ? 'Borrador' : 'Archivada'}
                  </Badge>
                  {onUnitSelect?.(unit, unitIndex)}
                </div>
              </header>
              {visibleItems.length ? (
                <div className="learning-items">
                  {visibleItems.map((item, itemIndex) => {
                    const kind = itemMeta[item.type];
                    const state = itemStatus(item, audience);
                    const href = audience === 'student' && courseSubjectId
                      ? `/estudiante/asignaturas/${courseSubjectId}/items/${item.id}`
                      : undefined;
                    const actions = onItemSelect?.(item, unit);
                    const content = (
                      <>
                        <span className={`learning-item__icon learning-item__icon--${item.type.toLowerCase()}`}><Icon name={kind.icon} /></span>
                        <span className="learning-item__copy">
                          <small>{kind.label}</small>
                          <strong>{item.title}</strong>
                          <span>{itemDescription(item)}</span>
                        </span>
                        <span className="learning-item__meta">
                          <Badge tone={state.tone}>{state.label}</Badge>
                          {item.dueAt ? <small><Icon name="clock" />Vence {formatDueAt(item.dueAt)}</small> : null}
                          {item.publicationStatus === 'SCHEDULED' && item.publishAt && audience === 'teacher' ? <small><Icon name="calendar" />{isEffectivelyVisible(item) ? 'Disponible desde ' : 'Disponible el '}{formatDueAt(item.publishAt)}</small> : null}
                        </span>
                        {actions ? <span className="learning-item__actions">{actions}</span> : href ? <Icon className="learning-item__chevron" name="chevron-right" /> : null}
                      </>
                    );
                    return href ? <Link className="learning-item" href={href} key={item.id}>{content}</Link> : <div className="learning-item" key={item.id} data-item-index={itemIndex}>{content}</div>;
                  })}
                </div>
              ) : <p className="learning-route__empty">Aún no hay contenido visible en esta unidad.</p>}
            </div>
          </section>
        );
      })}
      {!visibleUnits.length ? <p className="learning-route__empty">Aún no hay contenido visible en esta ruta.</p> : null}
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

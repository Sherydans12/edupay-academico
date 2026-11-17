'use client';

import { Badge, Button, Input, Select } from '@edupay/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { AcademicApiClient } from '@/api/academic-client';
import { Icon } from '@/components/icons';

import {
  preferredAcademicYearId,
  errorMessage,
  statusLabel,
  type AdminData,
} from './shared';

export type AcademicYearRecord = AdminData['academicYears'][number];

export const CONTEXT_YEAR_STORAGE_PREFIX = 'edupay.academico.contextYear:';

export function formatYearRange(year: AcademicYearRecord): string {
  const format = (value: string) =>
    new Date(`${value}T00:00:00.000Z`).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return `${format(year.startDate)} – ${format(year.endDate)}`;
}

export function yearStatusTone(
  status: AcademicYearRecord['status'],
): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DRAFT') return 'warning';
  return 'neutral';
}

/**
 * The academic year every administration view works on. The choice is kept
 * per browser and tenant (a convenience only); an unknown or archived year
 * falls back to the active one.
 */
export function useAcademicYearContext(data: AdminData, tenantKey: string) {
  const storageKey = `${CONTEXT_YEAR_STORAGE_PREFIX}${tenantKey}`;
  const [chosenId, setChosenId] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setChosenId(window.localStorage.getItem(storageKey) ?? '');
      } catch {
        setChosenId('');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  const selectableYears = useMemo(
    () => data.academicYears.filter((year) => year.status !== 'ARCHIVED'),
    [data.academicYears],
  );
  const contextYearId = selectableYears.some((year) => year.id === chosenId)
    ? chosenId
    : preferredAcademicYearId(data);
  const contextYear = data.academicYears.find(
    (year) => year.id === contextYearId,
  );
  const chooseYear = useCallback(
    (id: string) => {
      setChosenId(id);
      try {
        if (id) window.localStorage.setItem(storageKey, id);
        else window.localStorage.removeItem(storageKey);
      } catch {
        // Persistence is a convenience; the choice still applies now.
      }
    },
    [storageKey],
  );
  return { chooseYear, contextYear, contextYearId, selectableYears };
}

export function AcademicYearContextBar({
  contextYear,
  contextYearId,
  onChange,
  years,
}: {
  contextYear: AcademicYearRecord | undefined;
  contextYearId: string;
  onChange: (id: string) => void;
  years: AcademicYearRecord[];
}) {
  const activeYears = years.filter((year) => year.status === 'ACTIVE');
  let notice: ReactNode = null;
  if (!contextYear && activeYears.length > 1) {
    notice = `Hay ${activeYears.length} años activos: elige con cuál trabajar.`;
  } else if (!contextYear) {
    notice =
      'Todavía no hay un año académico. Créalo en Cursos › Años académicos.';
  } else if (contextYear.status === 'DRAFT') {
    const active = activeYears.find((year) => year.id !== contextYear.id);
    notice = `Estás preparando ${contextYear.label}${
      active ? `; ${active.label} sigue siendo el año activo` : ''
    }. Sus cursos y matrículas no cambian el año en curso.`;
  } else if (contextYear.status === 'CLOSED') {
    notice = `${contextYear.label} está cerrado: se consulta en solo lectura.`;
  }
  return (
    <section
      aria-labelledby="academic-year-context-title"
      className="academic-panel academic-year-context"
    >
      <div className="academic-year-context__summary">
        <span className="academic-year-context__icon">
          <Icon name="calendar" />
        </span>
        <div className="academic-year-context__copy">
          <span
            className="academic-year-context__eyebrow"
            id="academic-year-context-title"
          >
            Año en contexto
          </span>
          <strong>
            {contextYear ? contextYear.label : 'Sin año seleccionado'}
          </strong>
          {contextYear ? <small>{formatYearRange(contextYear)}</small> : null}
        </div>
        {contextYear ? (
          <Badge tone={yearStatusTone(contextYear.status)}>
            {statusLabel(contextYear.status)}
          </Badge>
        ) : null}
      </div>
      <Select
        id="academic-year-context"
        label="Cambiar año"
        value={contextYearId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecciona un año</option>
        {years.map((year) => (
          <option key={year.id} value={year.id}>
            {year.label} · {statusLabel(year.status)}
          </option>
        ))}
      </Select>
      {notice ? (
        <p className="academic-year-context__notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

/** Suggested label of the year after `base` when labels are plain years. */
export function nextYearLabel(
  base: AcademicYearRecord | undefined,
): string | null {
  if (!base || !/^\d{4}$/.test(base.label.trim())) return null;
  return String(Number(base.label.trim()) + 1);
}

export function AcademicYearForm({
  api,
  initialLabel = '',
  onSaved,
  title = 'Nuevo año académico',
}: {
  api: AcademicApiClient;
  initialLabel?: string;
  onSaved: () => void;
  title?: string;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createAcademicYear({ label, startDate, endDate });
      setLabel('');
      setStartDate('');
      setEndDate('');
      onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="academic-form" onSubmit={submit}>
      <h3>{title}</h3>
      <div className="academic-form__fields">
        <Input
          id="academic-year-label"
          label="Nombre"
          placeholder="2027"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          id="academic-year-start"
          label="Inicio"
          required
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          id="academic-year-end"
          label="Término"
          required
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button loading={saving} type="submit">
        Crear año
      </Button>
    </form>
  );
}

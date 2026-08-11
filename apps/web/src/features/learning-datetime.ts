/**
 * Pilot boundary for Learning datetime-local controls.
 *
 * Backend timestamps remain UTC instants. TenantConfiguration should own this
 * value once tenant-specific operational timezone configuration is available.
 */
export const LEARNING_OPERATIONAL_TIME_ZONE = 'America/Santiago' as const;

const dateTimeLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const operationalDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  calendar: 'gregory',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  numberingSystem: 'latn',
  second: '2-digit',
  timeZone: LEARNING_OPERATIONAL_TIME_ZONE,
  year: 'numeric',
});

type DateTimeParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0');
}

function partsAt(instantMs: number): DateTimeParts {
  const parts = Object.fromEntries(
    operationalDateTimeFormatter.formatToParts(new Date(instantMs))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );

  return {
    day: parts.day as number,
    hour: parts.hour as number,
    minute: parts.minute as number,
    month: parts.month as number,
    second: parts.second as number,
    year: parts.year as number,
  };
}

function isSameDateTime(left: DateTimeParts, right: DateTimeParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute && left.second === right.second;
}

function operationalOffsetMs(instantMs: number) {
  const parts = partsAt(instantMs);
  const operationalWallClockMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return operationalWallClockMs - instantMs;
}

function parseDateTimeLocal(value: string): { wallClockMs: number; parts: DateTimeParts } | undefined {
  const match = dateTimeLocalPattern.exec(value);
  if (!match) return undefined;

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue = '00', millisecondValue = '0'] = match;
  const parts = {
    day: Number(dayValue),
    hour: Number(hourValue),
    minute: Number(minuteValue),
    month: Number(monthValue),
    second: Number(secondValue),
    year: Number(yearValue),
  };
  const millisecond = Number(millisecondValue.padEnd(3, '0'));
  const wallClockMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
  const normalized = new Date(wallClockMs);

  if (
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() !== parts.month - 1 ||
    normalized.getUTCDate() !== parts.day ||
    normalized.getUTCHours() !== parts.hour ||
    normalized.getUTCMinutes() !== parts.minute ||
    normalized.getUTCSeconds() !== parts.second ||
    normalized.getUTCMilliseconds() !== millisecond
  ) return undefined;

  return { parts, wallClockMs };
}

/** Convert an operational datetime-local value into an absolute UTC instant. */
export function learningDateTimeLocalToInstant(value: string | null | undefined) {
  if (!value) return undefined;

  const parsed = parseDateTimeLocal(value);
  if (!parsed) return undefined;

  let instantMs = parsed.wallClockMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nextInstantMs = parsed.wallClockMs - operationalOffsetMs(instantMs);
    if (nextInstantMs === instantMs) break;
    instantMs = nextInstantMs;
  }

  // Reject nonexistent wall-clock values during a DST gap rather than
  // silently shifting them to another operational time.
  if (!isSameDateTime(partsAt(instantMs), parsed.parts)) return undefined;
  return new Date(instantMs).toISOString();
}

/** Convert an absolute UTC instant into the operational datetime-local value. */
export function learningInstantToDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';

  const instantMs = new Date(value).getTime();
  if (!Number.isFinite(instantMs)) return '';

  const parts = partsAt(instantMs);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

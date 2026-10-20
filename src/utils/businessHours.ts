/**
 * Centralized, Robust Business Hours & Timezone Engine (LocalHub)
 * 
 * Rules:
 * - Timezone: Strictly "America/Sao_Paulo" (UTC-3).
 * - Weekday Mapping: seg, ter, qua, qui, sex, sab, dom (Segunda a Domingo).
 * - Robust Data Normalization: Tolerates partial days, legacy intervals, alternate keys (open/close, enabled), and English aliases.
 * - Non-Destructive: Preserves explicit user configurations while defaulting missing weekdays to standard operational hours.
 */

export const DAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
export type DayKey = typeof DAY_KEYS[number];

export const DAY_NAMES: Record<DayKey, string> = {
  seg: 'Segunda-feira',
  ter: 'Terça-feira',
  qua: 'Quarta-feira',
  qui: 'Quinta-feira',
  sex: 'Sexta-feira',
  sab: 'Sábado',
  dom: 'Domingo',
};

export const SHORT_DAY_NAMES: Record<DayKey, string> = {
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
  dom: 'Dom',
};

export interface NormalizedDaySchedule {
  key: DayKey;
  label: string;
  isOpen: boolean;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
  formattedText: string; // "08:00 às 18:00" or "Fechado"
  intervals: Array<{ start: string; end: string }>;
}

export type NormalizedWeeklySchedule = Record<DayKey, NormalizedDaySchedule>;

export interface ScheduleStatus {
  isOpen: boolean;
  text: string;
  badgeClass: string;
  currentDayKey: DayKey;
  localTime: string;
}

const ALIAS_MAP: Record<string, DayKey> = {
  seg: 'seg',
  segunda: 'seg',
  'segunda-feira': 'seg',
  mon: 'seg',
  monday: 'seg',
  1: 'seg',

  ter: 'ter',
  terca: 'ter',
  terça: 'ter',
  'terca-feira': 'ter',
  'terça-feira': 'ter',
  tue: 'ter',
  tuesday: 'ter',
  2: 'ter',

  qua: 'qua',
  quarta: 'qua',
  'quarta-feira': 'qua',
  wed: 'qua',
  wednesday: 'qua',
  3: 'qua',

  qui: 'qui',
  quinta: 'qui',
  'quinta-feira': 'qui',
  thu: 'qui',
  thursday: 'qui',
  4: 'qui',

  sex: 'sex',
  sexta: 'sex',
  'sexta-feira': 'sex',
  fri: 'sex',
  friday: 'sex',
  5: 'sex',

  sab: 'sab',
  sabado: 'sab',
  sábado: 'sab',
  sat: 'sab',
  saturday: 'sab',
  6: 'sab',

  dom: 'dom',
  domingo: 'dom',
  sun: 'dom',
  sunday: 'dom',
  0: 'dom',
};

/**
 * Parses time string (e.g. "08:00" or "8:00") into minutes from midnight (0..1439).
 */
export function timeToMinutes(timeStr?: string | null): number {
  if (!timeStr || typeof timeStr !== 'string') return -1;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

/**
 * Converts minutes from midnight into 24h "HH:mm" string.
 */
export function minutesToTime(minutes: number): string {
  if (minutes < 0) return '08:00';
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Evaluates current date/time in timezone "America/Sao_Paulo" (UTC-3).
 */
export function getSaoPauloTime(baseDate: Date = new Date()): {
  dayKey: DayKey;
  dayIndex: number;
  hour: number;
  minute: number;
  currentMinutes: number;
  timeString: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = formatter.formatToParts(baseDate);
  const weekdayPart = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const hourPart = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minutePart = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const hour = hourPart % 24;
  const minute = minutePart % 60;

  const weekdayToDayKey: Record<string, DayKey> = {
    Sun: 'dom',
    Mon: 'seg',
    Tue: 'ter',
    Wed: 'qua',
    Thu: 'qui',
    Fri: 'sex',
    Sat: 'sab',
  };

  const dayKey = weekdayToDayKey[weekdayPart] || 'seg';
  const dayIndexMap: Record<DayKey, number> = {
    dom: 0,
    seg: 1,
    ter: 2,
    qua: 3,
    qui: 4,
    sex: 5,
    sab: 6,
  };

  return {
    dayKey,
    dayIndex: dayIndexMap[dayKey],
    hour,
    minute,
    currentMinutes: hour * 60 + minute,
    timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/**
 * Normalizes any raw schedule structure into a guaranteed 7-day NormalizedWeeklySchedule.
 * 
 * Guarantees:
 * 1. All 7 keys ('seg'..'dom') exist.
 * 2. Explicit user choices (e.g. 'sab' 08:00-12:00, 'dom' closed) are fully preserved.
 * 3. Missing weekdays default to active 08:00 às 18:00 (matching the admin panel's standard expectation).
 * 4. Missing Saturday defaults to active 08:00 às 12:00.
 * 5. Missing Sunday defaults to closed.
 * 6. Supports intervals, open/close, from/to, start/end, and enabled/open properties.
 */
export function normalizeSchedule(rawSchedule?: any): NormalizedWeeklySchedule {
  const result: Partial<NormalizedWeeklySchedule> = {};

  // If input is an array of day objects, convert to lookup map
  let sourceMap: Record<string, any> = {};
  if (Array.isArray(rawSchedule)) {
    rawSchedule.forEach((item, idx) => {
      const dayIdentifier = String(item.day || item.key || idx);
      sourceMap[dayIdentifier] = item;
    });
  } else if (rawSchedule && typeof rawSchedule === 'object') {
    sourceMap = { ...rawSchedule };
  }

  for (const dayKey of DAY_KEYS) {
    // Find matching candidate key in source
    let candidate = sourceMap[dayKey];
    if (!candidate) {
      // Check aliases
      for (const [alias, targetKey] of Object.entries(ALIAS_MAP)) {
        if (targetKey === dayKey && sourceMap[alias] !== undefined) {
          candidate = sourceMap[alias];
          break;
        }
      }
    }

    if (candidate) {
      // Determine active status
      let isOpen = true;
      if (candidate.isOpen !== undefined) isOpen = Boolean(candidate.isOpen);
      else if (candidate.open !== undefined && typeof candidate.open === 'boolean') isOpen = candidate.open;
      else if (candidate.enabled !== undefined) isOpen = Boolean(candidate.enabled);
      else if (candidate.active !== undefined) isOpen = Boolean(candidate.active);

      // Determine intervals or times
      let intervals: Array<{ start: string; end: string }> = [];
      if (Array.isArray(candidate.intervals) && candidate.intervals.length > 0) {
        intervals = candidate.intervals
          .map((iv: any) => ({
            start: iv.start || iv.open || iv.from || '08:00',
            end: iv.end || iv.close || iv.to || '18:00',
          }))
          .filter((iv: any) => timeToMinutes(iv.start) !== -1 && timeToMinutes(iv.end) !== -1);
      }

      let openTime = candidate.openTime || candidate.open || candidate.start || candidate.from;
      let closeTime = candidate.closeTime || candidate.close || candidate.end || candidate.to;

      if (!openTime && intervals.length > 0) {
        openTime = intervals[0].start;
      }
      if (!closeTime && intervals.length > 0) {
        closeTime = intervals[intervals.length - 1].end;
      }

      // Fallback times if missing
      openTime = openTime && typeof openTime === 'string' ? openTime.trim() : '08:00';
      closeTime = closeTime && typeof closeTime === 'string' ? closeTime.trim() : (dayKey === 'sab' ? '12:00' : '18:00');

      if (intervals.length === 0 && isOpen) {
        intervals = [{ start: openTime, end: closeTime }];
      }

      const formattedText = isOpen
        ? intervals.length > 1
          ? intervals.map((iv) => `${iv.start} às ${iv.end}`).join(' e ')
          : `${openTime} às ${closeTime}`
        : 'Fechado';

      result[dayKey] = {
        key: dayKey,
        label: DAY_NAMES[dayKey],
        isOpen,
        openTime,
        closeTime,
        formattedText,
        intervals,
      };
    } else {
      // Default fallback for missing day:
      // Mon-Fri: open 08:00 às 18:00
      // Sat: open 08:00 às 12:00
      // Sun: closed
      const isWeekendSunday = dayKey === 'dom';
      const isOpen = !isWeekendSunday;
      const openTime = '08:00';
      const closeTime = dayKey === 'sab' ? '12:00' : '18:00';
      const formattedText = isOpen ? `${openTime} às ${closeTime}` : 'Fechado';

      result[dayKey] = {
        key: dayKey,
        label: DAY_NAMES[dayKey],
        isOpen,
        openTime,
        closeTime,
        formattedText,
        intervals: isOpen ? [{ start: openTime, end: closeTime }] : [],
      };
    }
  }

  return result as NormalizedWeeklySchedule;
}

/**
 * Calculates current open/closed status badge based on "America/Sao_Paulo" time.
 */
export function calculateScheduleStatus(
  rawSchedule: any,
  baseDate: Date = new Date()
): ScheduleStatus {
  const schedule = normalizeSchedule(rawSchedule);
  const spTime = getSaoPauloTime(baseDate);
  const currentDay = schedule[spTime.dayKey];

  if (!currentDay || !currentDay.isOpen) {
    // Look ahead to find next opening day
    const dayKeysList = DAY_KEYS;
    const currentIdx = dayKeysList.indexOf(spTime.dayKey);
    let nextOpeningDay: NormalizedDaySchedule | null = null;
    let daysAhead = 1;

    for (let i = 1; i <= 7; i++) {
      const nextKey = dayKeysList[(currentIdx + i) % 7];
      const checkDay = schedule[nextKey];
      if (checkDay && checkDay.isOpen) {
        nextOpeningDay = checkDay;
        daysAhead = i;
        break;
      }
    }

    let closedText = 'Fechado hoje';
    if (nextOpeningDay) {
      if (daysAhead === 1) {
        closedText = `Fechado agora · Abre amanhã às ${nextOpeningDay.openTime}`;
      } else {
        const shortName = SHORT_DAY_NAMES[nextOpeningDay.key].toLowerCase();
        closedText = `Fechado agora · Abre ${shortName} às ${nextOpeningDay.openTime}`;
      }
    }

    return {
      isOpen: false,
      text: closedText,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      currentDayKey: spTime.dayKey,
      localTime: spTime.timeString,
    };
  }

  // Today is an open day. Check active intervals:
  const intervals = currentDay.intervals && currentDay.intervals.length > 0
    ? currentDay.intervals
    : [{ start: currentDay.openTime, end: currentDay.closeTime }];

  // 1. Are we currently inside any interval?
  for (const iv of intervals) {
    const startMin = timeToMinutes(iv.start);
    const endMin = timeToMinutes(iv.end);

    if (spTime.currentMinutes >= startMin && spTime.currentMinutes < endMin) {
      return {
        isOpen: true,
        text: `Aberto agora · Fecha às ${iv.end}`,
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        currentDayKey: spTime.dayKey,
        localTime: spTime.timeString,
      };
    }
  }

  // 2. Are we before the first interval today?
  const firstStartMin = timeToMinutes(intervals[0].start);
  if (spTime.currentMinutes < firstStartMin) {
    return {
      isOpen: false,
      text: `Fechado agora · Abre às ${intervals[0].start}`,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      currentDayKey: spTime.dayKey,
      localTime: spTime.timeString,
    };
  }

  // 3. Are we between intervals (e.g. lunch break)?
  for (let i = 0; i < intervals.length - 1; i++) {
    const endCurrent = timeToMinutes(intervals[i].end);
    const startNext = timeToMinutes(intervals[i + 1].start);
    if (spTime.currentMinutes >= endCurrent && spTime.currentMinutes < startNext) {
      return {
        isOpen: false,
        text: `Fechado para intervalo · Abre às ${intervals[i + 1].start}`,
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        currentDayKey: spTime.dayKey,
        localTime: spTime.timeString,
      };
    }
  }

  // 4. We are after the last interval today
  const dayKeysList = DAY_KEYS;
  const currentIdx = dayKeysList.indexOf(spTime.dayKey);
  let nextOpeningDay: NormalizedDaySchedule | null = null;
  let daysAhead = 1;

  for (let i = 1; i <= 7; i++) {
    const nextKey = dayKeysList[(currentIdx + i) % 7];
    const checkDay = schedule[nextKey];
    if (checkDay && checkDay.isOpen) {
      nextOpeningDay = checkDay;
      daysAhead = i;
      break;
    }
  }

  let afterCloseText = 'Fechado no momento';
  if (nextOpeningDay) {
    if (daysAhead === 1) {
      afterCloseText = `Fechado agora · Abre amanhã às ${nextOpeningDay.openTime}`;
    } else {
      const shortName = SHORT_DAY_NAMES[nextOpeningDay.key].toLowerCase();
      afterCloseText = `Fechado agora · Abre ${shortName} às ${nextOpeningDay.openTime}`;
    }
  }

  return {
    isOpen: false,
    text: afterCloseText,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    currentDayKey: spTime.dayKey,
    localTime: spTime.timeString,
  };
}

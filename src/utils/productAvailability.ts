/**
 * Product Day-of-Week Availability Utilities
 * LocalHub Multi-Tenant Digital Catalog & Delivery Platform
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo, 1 = Segunda-feira, ..., 6 = Sábado

export interface ProductAvailabilityConfig {
  sameChannels: boolean; // se true, os mesmos dias são aplicados para Mesa e Delivery
  tableDays: DayOfWeek[]; // dias permitidos no catálogo de mesa
  deliveryDays: DayOfWeek[]; // dias permitidos no delivery
}

export const ALL_DAYS_OF_WEEK: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

// Ordered according to standard Brazilian business week (Monday to Sunday)
export const WEEK_DAYS_ORDER: Array<{
  day: DayOfWeek;
  name: string;
  short: string;
  abbr: string;
}> = [
  { day: 1, name: 'Segunda-feira', short: 'Segunda', abbr: 'Seg' },
  { day: 2, name: 'Terça-feira', short: 'Terça', abbr: 'Ter' },
  { day: 3, name: 'Quarta-feira', short: 'Quarta', abbr: 'Qua' },
  { day: 4, name: 'Quinta-feira', short: 'Quinta', abbr: 'Qui' },
  { day: 5, name: 'Sexta-feira', short: 'Sexta', abbr: 'Sex' },
  { day: 6, name: 'Sábado', short: 'Sábado', abbr: 'Sáb' },
  { day: 0, name: 'Domingo', short: 'Domingo', abbr: 'Dom' },
];

export const DEFAULT_PRODUCT_AVAILABILITY: ProductAvailabilityConfig = {
  sameChannels: true,
  tableDays: [0, 1, 2, 3, 4, 5, 6],
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Returns current day of week in Brazil (America/Sao_Paulo timezone).
 */
export function getCurrentDayOfWeek(date: Date = new Date(), timezone = 'America/Sao_Paulo'): DayOfWeek {
  try {
    const dayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(date);

    const map: Record<string, DayOfWeek> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return map[dayStr] ?? (date.getDay() as DayOfWeek);
  } catch {
    return date.getDay() as DayOfWeek;
  }
}

/**
 * Returns human-readable day name.
 */
export function getDayName(day: DayOfWeek): string {
  const found = WEEK_DAYS_ORDER.find((d) => d.day === day);
  return found ? found.name : 'Dia desconhecido';
}

/**
 * Validates if a product is available on the specified day of the week for a specific channel.
 * Backward compatibility: If availabilityDays is missing, null, or undefined, returns true.
 */
export function isProductAvailableOnDay(
  product: { availabilityDays?: ProductAvailabilityConfig | null; availability_days?: any } | null | undefined,
  day: DayOfWeek,
  channel: 'table' | 'delivery'
): boolean {
  if (!product) return false;

  const rawConfig = product.availabilityDays || product.availability_days;

  // Backward compatibility: If no configuration exists, product is available every day
  if (!rawConfig) {
    return true;
  }

  const sameChannels = rawConfig.sameChannels !== false;

  if (sameChannels) {
    const days: DayOfWeek[] = Array.isArray(rawConfig.tableDays)
      ? rawConfig.tableDays
      : Array.isArray(rawConfig.deliveryDays)
      ? rawConfig.deliveryDays
      : ALL_DAYS_OF_WEEK;

    return days.includes(day);
  }

  const channelDays: DayOfWeek[] =
    channel === 'table'
      ? Array.isArray(rawConfig.tableDays)
        ? rawConfig.tableDays
        : ALL_DAYS_OF_WEEK
      : Array.isArray(rawConfig.deliveryDays)
      ? rawConfig.deliveryDays
      : ALL_DAYS_OF_WEEK;

  return channelDays.includes(day);
}

/**
 * Formats a list of days into a concise, readable string.
 */
export function formatDaysListLabel(days: DayOfWeek[]): string {
  if (!days || days.length === 0) {
    return 'Nenhum dia selecionado';
  }

  if (days.length === 7) {
    return 'Todos os dias';
  }

  // Check weekdays: Seg, Ter, Qua, Qui, Sex (1, 2, 3, 4, 5)
  const weekdays = [1, 2, 3, 4, 5];
  const isOnlyWeekdays =
    days.length === 5 && weekdays.every((d) => days.includes(d as DayOfWeek));
  if (isOnlyWeekdays) {
    return 'Segunda a Sexta';
  }

  // Check weekend: Sáb, Dom (6, 0)
  const isWeekendOnly =
    days.length === 2 && days.includes(0) && days.includes(6);
  if (isWeekendOnly) {
    return 'Finais de semana (Sáb e Dom)';
  }

  // Check Wednesday to Sunday (common restaurant schedule)
  const wedToSun = [3, 4, 5, 6, 0];
  const isWedToSun =
    days.length === 5 && wedToSun.every((d) => days.includes(d as DayOfWeek));
  if (isWedToSun) {
    return 'Quarta a Domingo';
  }

  // Check Thursday to Sunday
  const thuToSun = [4, 5, 6, 0];
  const isThuToSun =
    days.length === 4 && thuToSun.every((d) => days.includes(d as DayOfWeek));
  if (isThuToSun) {
    return 'Quinta a Domingo';
  }

  // Check Tuesday to Sunday
  const tueToSun = [2, 3, 4, 5, 6, 0];
  const isTueToSun =
    days.length === 6 && tueToSun.every((d) => days.includes(d as DayOfWeek));
  if (isTueToSun) {
    return 'Terça a Domingo';
  }

  // Default: list abbreviations in standard Brazilian order (Monday to Sunday)
  const sorted = WEEK_DAYS_ORDER.filter((w) => days.includes(w.day)).map((w) => w.abbr);
  return sorted.join(', ');
}

/**
 * Formats the full product availability summary for list views and cards.
 */
export function formatProductAvailabilitySummary(
  config?: ProductAvailabilityConfig | null
): string {
  if (!config) {
    return 'Todos os dias';
  }

  if (config.sameChannels !== false) {
    return formatDaysListLabel(config.tableDays || ALL_DAYS_OF_WEEK);
  }

  const tableLabel = formatDaysListLabel(config.tableDays || ALL_DAYS_OF_WEEK);
  const deliveryLabel = formatDaysListLabel(config.deliveryDays || ALL_DAYS_OF_WEEK);

  if (tableLabel === deliveryLabel) {
    return tableLabel;
  }

  return `Mesa: ${tableLabel} • Delivery: ${deliveryLabel}`;
}

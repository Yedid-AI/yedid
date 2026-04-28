import { useMemo } from 'react'
import { startOfDay, startOfWeek, subDays, startOfMonth } from 'date-fns'

/**
 * Compute ISO `dateFrom` / `dateTo` for the standard preset filters used across
 * Leads / Calls / Dashboard. Centralized so changing "this week" semantics (Mon-start)
 * or extending presets only happens in one place.
 *
 * @param {string} preset - 'today' | 'thisWeek' | 'last30' | 'thisMonth' | 'all' | 'custom'
 * @param {{from?: Date|string, to?: Date|string}} [customRange] - required when preset === 'custom'
 * @returns {{ dateFrom: string|undefined, dateTo: string|undefined }}
 */
export function useDateRange(preset, customRange) {
  return useMemo(() => {
    const now = new Date()
    switch (preset) {
      case 'today':
        return { dateFrom: startOfDay(now).toISOString(), dateTo: now.toISOString() }
      case 'thisWeek':
        return { dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), dateTo: now.toISOString() }
      case 'last30':
        return { dateFrom: subDays(now, 30).toISOString(), dateTo: now.toISOString() }
      case 'thisMonth':
        return { dateFrom: startOfMonth(now).toISOString(), dateTo: now.toISOString() }
      case 'all':
        return { dateFrom: undefined, dateTo: undefined }
      case 'custom':
        return {
          dateFrom: customRange?.from ? startOfDay(new Date(customRange.from)).toISOString() : undefined,
          dateTo: customRange?.to
            ? new Date(new Date(customRange.to).setHours(23, 59, 59, 999)).toISOString()
            : undefined,
        }
      default:
        return { dateFrom: undefined, dateTo: undefined }
    }
  }, [preset, customRange])
}

export const DATE_RANGE_PRESETS = ['today', 'thisWeek', 'last30', 'thisMonth', 'all', 'custom']

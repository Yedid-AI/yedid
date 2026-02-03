import { useRef, useCallback } from 'react'
import { useI18n } from '../../lib/i18n'
import { Button } from '../ui/button'

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function createFullSchedule(value = true) {
  const schedule = {}
  for (const d of DAYS) {
    schedule[String(d)] = Array(24).fill(value)
  }
  return schedule
}

export default function ScheduleGrid({ schedule, onChange, disabled = false }) {
  const { t } = useI18n()
  const isPainting = useRef(false)
  const paintValue = useRef(true)
  const localSchedule = useRef(null)

  const dayNames = DAYS.map(d => t(`schedule.day${d}`))

  // null schedule = all active (24/7)
  const effective = schedule || createFullSchedule(true)

  const getCellValue = (day, hour) => {
    return effective[String(day)]?.[hour] ?? true
  }

  const handleMouseDown = useCallback((day, hour, e) => {
    e.preventDefault()
    if (disabled) return
    const currentVal = effective[String(day)]?.[hour] ?? true
    paintValue.current = !currentVal
    isPainting.current = true
    const base = schedule ? JSON.parse(JSON.stringify(schedule)) : createFullSchedule(true)
    base[String(day)][hour] = paintValue.current
    localSchedule.current = base
    onChange(base)
  }, [schedule, disabled, onChange, effective])

  const handleMouseEnter = useCallback((day, hour) => {
    if (!isPainting.current || disabled) return
    const base = localSchedule.current
    if (!base) return
    base[String(day)][hour] = paintValue.current
    onChange({ ...base })
  }, [disabled, onChange])

  const handleMouseUp = useCallback(() => {
    isPainting.current = false
  }, [])

  const handleSelectAll = () => onChange(createFullSchedule(true))
  const handleClearAll = () => onChange(createFullSchedule(false))
  const handleReset = () => onChange(null)

  return (
    <div
      className="select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Hour headers */}
      <div className="flex ms-10 gap-px mb-1">
        {HOURS.map(h => (
          <div key={h} className="flex-1 min-w-0 text-center">
            {h % 3 === 0 ? (
              <span className="text-[10px] text-muted-foreground">{h}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {DAYS.map((day, di) => (
        <div key={day} className="flex items-center gap-px mb-px">
          <span className="w-10 text-xs text-muted-foreground text-end pe-2 shrink-0">
            {dayNames[di]}
          </span>
          {HOURS.map(hour => {
            const active = getCellValue(day, hour)
            return (
              <div
                key={hour}
                className={`flex-1 min-w-0 h-7 rounded-[3px] transition-all ${
                  active
                    ? 'bg-emerald-500/15 dark:bg-emerald-500/20 hover:bg-emerald-400/35 dark:hover:bg-emerald-400/40'
                    : 'bg-muted hover:bg-muted-foreground/10'
                } ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}
                onMouseDown={(e) => handleMouseDown(day, hour, e)}
                onMouseEnter={() => handleMouseEnter(day, hour)}
              />
            )
          })}
        </div>
      ))}

      {/* Quick actions */}
      <div className="flex items-center gap-2 mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={disabled}
          className="text-xs h-7"
        >
          {t('inboxes.selectAll')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={disabled}
          className="text-xs h-7"
        >
          {t('inboxes.clearAll')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={disabled}
          className="text-xs h-7"
        >
          {t('inboxes.resetSchedule')}
        </Button>
      </div>
    </div>
  )
}

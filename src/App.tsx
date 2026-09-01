import { useState, useMemo, useEffect, useRef } from 'react'
import { useGoogleAuth } from './hooks/useGoogleAuth'
import { useCalendarEvents } from './hooks/useCalendarEvents'
import { useMonthEvents } from './hooks/useMonthEvents'
import { useSearchEvents } from './hooks/useSearchEvents'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { classifyEvent } from './utils/classifyEvent'
import { getHolidaysForDay, hasHoliday, type IsraeliHoliday } from './utils/israeliHolidays'
import type { CalendarEvent } from './services/calendarApi'
import type { Person } from './config/people'
import { PEOPLE, DEFAULT_OWNER_ID } from './config/people'
import { THEMES, DEFAULT_THEME, type Theme } from './config/themes'

// ── date helpers ──────────────────────────────────────────────────────────────

function getEventDate(event: CalendarEvent): Date | null {
  const raw = event.start.dateTime ?? event.start.date
  return raw ? new Date(raw) : null
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Returns true if `day` (local midnight) falls within the event's duration.
// All-day events: range is [start.date, end.date) — end is exclusive per Google Calendar spec.
function eventCoversDay(event: CalendarEvent, day: Date): boolean {
  if (event.start.date) {
    // All-day event: end.date is exclusive per Google Calendar spec
    const start = new Date(event.start.date + 'T00:00:00')
    const end = event.end?.date
      ? new Date(event.end.date + 'T00:00:00')
      : new Date(start.getTime() + 86400000)
    return day >= start && day < end
  }
  if (event.start.dateTime) {
    // Timed event (may span multiple days): check overlap with this calendar day
    const eventStart = new Date(event.start.dateTime)
    const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime) : eventStart
    const dayEnd = new Date(day.getTime() + 86400000) // start of next day
    return eventStart < dayEnd && eventEnd > day
  }
  return false
}

function getWeekDays(weekOffset = 0): Date[] {
  const today = new Date()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay() + weekOffset * 7)
  sunday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
}

// Computes a new weekOffset by shifting the currently viewed week's Sunday
// forward/backward by `months` calendar months.
function offsetByPeriod(weekOffset: number, months: number): number {
  const today = new Date()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay() + weekOffset * 7)
  sunday.setHours(0, 0, 0, 0)

  const target = new Date(sunday)
  target.setMonth(target.getMonth() + months)

  const targetSunday = new Date(target)
  targetSunday.setDate(target.getDate() - target.getDay())
  targetSunday.setHours(0, 0, 0, 0)

  const baseSunday = new Date(today)
  baseSunday.setDate(today.getDate() - today.getDay())
  baseSunday.setHours(0, 0, 0, 0)

  return Math.round((targetSunday.getTime() - baseSunday.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function getWeekLabel(weekOffset: number, days: Date[]): string {
  const fmtShort = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  const fmtFull  = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
  // Show year only on the end date to keep the label compact
  const range = `${fmtShort(days[0])} – ${fmtFull(days[6])}`
  if (weekOffset === 0) return `השבוע · ${range}`
  if (weekOffset === 1) return `שבוע הבא · ${range}`
  if (weekOffset === -1) return `שבוע שעבר · ${range}`
  return range
}

function formatWeekday(day: Date): string {
  return day.toLocaleDateString('he-IL', { weekday: 'long' })
}

function formatShortDate(day: Date): string {
  return day.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

function formatTime(event: CalendarEvent): string {
  if (event.start.date) return 'כל היום'
  if (!event.start.dateTime) return ''
  return new Date(event.start.dateTime).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.start.date) return 'כל היום'
  if (!event.start.dateTime) return ''
  const fmt = (s: string) =>
    new Date(s).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  const start = fmt(event.start.dateTime)
  if (!event.end.dateTime) return start
  return `${start} – ${fmt(event.end.dateTime)}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

// Detects whether an event fell through to the default owner with no explicit name match ("כללי").
// Uses the same prefix-aware matching as classifyEvent without modifying that module.
function isGeneralEvent(title: string, person: Person): boolean {
  if (person.id !== DEFAULT_OWNER_ID) return false
  const defaultPerson = PEOPLE.find(p => p.id === DEFAULT_OWNER_ID)!
  const names = [defaultPerson.name, ...defaultPerson.aliases]
  const words = (title ?? '').trim().split(/\s+/)
  return !words.some(w =>
    names.some(n => {
      if (w === n) return true
      if (!w.endsWith(n)) return false
      return /^[ולשבכהמ]+$/.test(w.slice(0, w.length - n.length))
    })
  )
}

// ── ThemePicker ───────────────────────────────────────────────────────────────

function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {/* Trigger — mini theme preview card */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-6 rounded-md border border-gray-600 hover:border-gray-400 overflow-hidden transition-colors shrink-0"
        style={{ backgroundColor: `rgb(${theme.bg})` }}
        aria-label="ערכת צבעים"
        title="שינוי ערכת צבעים"
      >
        <span
          className="absolute bottom-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: `rgb(${theme.accent})` }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 border border-gray-700 rounded-2xl p-3 shadow-2xl z-50"
          style={{ left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgb(var(--surf))' }}
        >
          <p className="text-xs text-gray-500 mb-2 text-center whitespace-nowrap">ערכת צבעים</p>
          <div className="flex gap-2">
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => { onChange(t); setOpen(false) }}
                className={`relative w-11 h-9 rounded-xl overflow-hidden border-2 transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
                  t.id === theme.id
                    ? 'border-white scale-105'
                    : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                }`}
                style={{ backgroundColor: `rgb(${t.bg})` }}
                title={t.name}
                aria-label={t.name}
              >
                {/* Person color dots */}
                <div className="flex gap-0.5">
                  {Object.values(t.personColors).slice(0, 3).map((c, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
                {/* Accent stripe */}
                <span
                  className="absolute bottom-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: `rgb(${t.accent})` }}
                />
              </button>
            ))}
          </div>
          {/* Theme name */}
          <p className="text-xs text-gray-400 text-center mt-2">{theme.name}</p>
        </div>
      )}
    </div>
  )
}

// ── SearchIcon ────────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

// ── PersonBadge ───────────────────────────────────────────────────────────────

function PersonBadge({ person }: { person: Person }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
      style={{
        backgroundColor: person.color + '22',
        color: person.color,
        border: `1px solid ${person.color}55`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: person.color }} />
      {person.name}
    </span>
  )
}

// ── GeneralBadge ──────────────────────────────────────────────────────────────

function GeneralBadge() {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 font-medium shrink-0 border border-gray-700">
      כללי
    </span>
  )
}

// ── HolidayChip ───────────────────────────────────────────────────────────────

function HolidayChip({ holiday }: { holiday: IsraeliHoliday }) {
  const styles: Record<IsraeliHoliday['type'], string> = {
    chag:          'bg-amber-900/50 text-amber-200 border-amber-700/60',
    erev:          'bg-amber-950/50 text-amber-400 border-amber-800/50',
    'chol-hamoed': 'bg-yellow-950/50 text-yellow-400 border-yellow-800/50',
    modern:        'bg-blue-950/50 text-blue-300 border-blue-800/50',
    minor:         'bg-purple-950/50 text-purple-300 border-purple-800/50',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${styles[holiday.type]}`}>
      ✡ {holiday.name}
    </span>
  )
}

// ── Chip (filter button) ──────────────────────────────────────────────────────

function Chip({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  color?: string
}) {
  const activeStyle =
    active && color
      ? { backgroundColor: color + '22', color, borderColor: color + '66' }
      : active
      ? { backgroundColor: '#4f46e5', color: '#fff', borderColor: '#4f46e5' }
      : {}

  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-sm px-3 py-1 rounded-full border transition-colors ${
        active
          ? 'font-semibold'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
      }`}
      style={activeStyle}
    >
      {children}
    </button>
  )
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({
  activeFilter,
  onFilter,
}: {
  activeFilter: string | null
  onFilter: (id: string | null) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      <Chip active={activeFilter === null} onClick={() => onFilter(null)}>
        הכל
      </Chip>
      {PEOPLE.map(p => (
        <Chip
          key={p.id}
          active={activeFilter === p.id}
          onClick={() => onFilter(p.id)}
          color={p.color}
        >
          {p.name}
        </Chip>
      ))}
    </div>
  )
}

// ── WeekNav ───────────────────────────────────────────────────────────────────

function WeekNav({
  weekOffset,
  days,
  loading,
  onPrev,
  onNext,
  onToday,
  onPrevMonth,
  onNextMonth,
  onPrevYear,
  onNextYear,
}: {
  weekOffset: number
  days: Date[]
  loading: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onPrevYear: () => void
  onNextYear: () => void
}) {
  const navBtn = 'shrink-0 text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 active:bg-gray-700 transition-colors select-none'

  return (
    <div className="flex flex-col gap-0.5" dir="ltr">
      {/* Week row */}
      <div className="flex items-center w-full">
        <button
          onClick={onNext}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-800 active:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors text-2xl leading-none select-none"
          aria-label="שבוע הבא"
        >
          ‹
        </button>

        <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
          <span className="text-sm text-gray-300 font-medium truncate">
            {getWeekLabel(weekOffset, days)}
          </span>
          {loading && (
            <span className="w-1.5 h-1.5 rounded-full acc-bg animate-pulse shrink-0" />
          )}
          {weekOffset !== 0 && (
            <button
              onClick={onToday}
              className="shrink-0 text-xs px-2 py-0.5 rounded-full acc-nav-btn border transition-colors"
            >
              היום
            </button>
          )}
        </div>

        <button
          onClick={onPrev}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-800 active:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors text-2xl leading-none select-none"
          aria-label="שבוע הקודם"
        >
          ›
        </button>
      </div>

      {/* Month / Year row */}
      <div className="flex items-center justify-between px-1">
        <div className="flex gap-1">
          <button onClick={onNextYear}  className={navBtn} aria-label="שנה הבאה">‹‹ שנה</button>
          <button onClick={onNextMonth} className={navBtn} aria-label="חודש הבא">‹ חודש</button>
        </div>
        <div className="flex gap-1">
          <button onClick={onPrevMonth} className={navBtn} aria-label="חודש קודם">חודש ›</button>
          <button onClick={onPrevYear}  className={navBtn} aria-label="שנה קודמת">שנה ››</button>
        </div>
      </div>
    </div>
  )
}

// ── EventDetailModal ──────────────────────────────────────────────────────────

function EventDetailModal({ event, person, onClose }: { event: CalendarEvent; person: Person; onClose: () => void }) {
  const description = event.description ? stripHtml(event.description) : null
  const hasExtra = !!(description || event.location)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm bg-surf rounded-2xl border border-gray-700 p-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Title row: dot + title + close button */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span
              className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: person.color }}
            />
            <h2 className="text-base font-semibold text-gray-100 leading-snug">
              {event.summary ?? '(ללא כותרת)'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-500 hover:text-gray-300 text-lg leading-none mt-0.5 px-1"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Time */}
        <p className="text-sm text-gray-400 mb-3 mr-5">{formatTimeRange(event)}</p>

        {/* Location */}
        {event.location && (
          <p className="text-sm text-gray-400 mb-2 mr-5">
            <span className="text-gray-600 ml-1">📍</span>{event.location}
          </p>
        )}

        {/* Description */}
        {description && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap mr-5 mt-3 leading-relaxed">
            {description}
          </p>
        )}

        {!hasExtra && (
          <p className="text-sm text-gray-600 italic mr-5">אין פרטים נוספים לאירוע זה</p>
        )}
      </div>
    </div>
  )
}

// ── AgendaEventRow ────────────────────────────────────────────────────────────

function AgendaEventRow({
  event,
  person,
  isGeneral,
  onClick,
}: {
  event: CalendarEvent
  person: Person
  isGeneral: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-gray-800/40 active:bg-gray-800/60 transition-colors text-right"
    >
      {/* Time — rightmost (RTL start) */}
      <span className="text-xs text-gray-500 shrink-0 w-16 text-right tabular-nums">
        {formatTime(event)}
      </span>
      {/* Title */}
      <span className="flex-1 text-sm text-gray-100 truncate min-w-0">
        {event.summary ?? '(ללא כותרת)'}
      </span>
      {/* Badges — leftmost (RTL end) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isGeneral && <GeneralBadge />}
        <PersonBadge person={person} />
      </div>
    </button>
  )
}

// ── DaySection ────────────────────────────────────────────────────────────────

function DaySection({
  day,
  events,
  onEventClick,
}: {
  day: Date
  events: Array<{ event: CalendarEvent; person: Person; isGeneral: boolean }>
  onEventClick: (event: CalendarEvent, person: Person) => void
}) {
  const today = isSameDay(new Date(), day)
  const holidays = getHolidaysForDay(day)

  return (
    <div
      id={today ? 'today-section' : undefined}
      className={`rounded-xl overflow-hidden ${
        today ? 'ring-2 acc-ring' : 'ring-1 ring-gray-800'
      }`}
    >
      {/* Day header */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${
          today ? 'acc-bg-mid' : 'bg-surf'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm ${today ? 'acc-text' : 'text-gray-300'}`}>
            {formatWeekday(day)}
          </span>
          <span className="text-xs text-gray-500">{formatShortDate(day)}</span>
          {today && (
            <span className="text-xs px-1.5 py-0.5 rounded-full acc-bg text-white font-medium leading-none">
              היום
            </span>
          )}
        </div>
        {events.length > 0 && (
          <span className="text-xs text-gray-600">{events.length}</span>
        )}
      </div>

      {/* Holiday chips */}
      {holidays.length > 0 && (
        <div className="px-4 py-1.5 flex flex-wrap gap-1.5 bg-amber-950/20 border-b border-amber-900/20">
          {holidays.map((h, i) => <HolidayChip key={i} holiday={h} />)}
        </div>
      )}

      {/* Event list */}
      <div className={`divide-y divide-gray-800/50 ${today ? 'acc-bg-faint' : 'bg-surf-40'}`}>
        {events.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-700 italic">אין אירועים</p>
        ) : (
          events.map(({ event, person, isGeneral }) => (
            <AgendaEventRow
              key={event.id}
              event={event}
              person={person}
              isGeneral={isGeneral}
              onClick={() => onEventClick(event, person)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── SearchResults ─────────────────────────────────────────────────────────────

function localDateKey(event: CalendarEvent): string {
  const raw = event.start.date ?? event.start.dateTime
  if (!raw) return ''
  const d = new Date(event.start.date ? raw + 'T00:00:00' : raw)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SearchResults({
  events,
  loading,
  loadingMore,
  hasMore,
  loadMore,
  onEventClick,
}: {
  events: Array<{ event: CalendarEvent; person: Person; isGeneral: boolean }>
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  onEventClick: (event: CalendarEvent, person: Person) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-600 text-sm">לא נמצאו אירועים</p>
      </div>
    )
  }

  // Group by local calendar date
  const byDate = new Map<string, typeof events>()
  for (const e of events) {
    const key = localDateKey(e.event)
    if (!key) continue
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(e)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-600 px-1">
        {events.length} אירועים{hasMore ? '+' : ''}
      </p>

      {Array.from(byDate.entries()).map(([key, dayEvents]) => {
        const date = new Date(key + 'T00:00:00')
        const today = isSameDay(date, new Date())
        return (
          <div
            key={key}
            className={`rounded-xl overflow-hidden ${today ? 'ring-2 acc-ring' : 'ring-1 ring-gray-800'}`}
          >
            <div className={`flex items-center justify-between px-4 py-2.5 ${today ? 'acc-bg-mid' : 'bg-surf'}`}>
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-sm ${today ? 'acc-text' : 'text-gray-300'}`}>
                  {date.toLocaleDateString('he-IL', { weekday: 'long' })}
                </span>
                <span className="text-xs text-gray-500">
                  {date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                </span>
                {today && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full acc-bg text-white font-medium leading-none">
                    היום
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-600">{dayEvents.length}</span>
            </div>
            <div className={`divide-y divide-gray-800/50 ${today ? 'acc-bg-faint' : 'bg-surf-40'}`}>
              {dayEvents.map(({ event, person, isGeneral }) => (
                <AgendaEventRow
                  key={event.id}
                  event={event}
                  person={person}
                  isGeneral={isGeneral}
                  onClick={() => onEventClick(event, person)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 text-sm acc-text hover:acc-text-light disabled:opacity-50 border border-gray-800 rounded-xl hover:bg-gray-900/40 transition-colors"
        >
          {loadingMore ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" />
              טוען...
            </span>
          ) : (
            'טען עוד תוצאות ›'
          )}
        </button>
      )}
    </div>
  )
}

// ── Month helpers ─────────────────────────────────────────────────────────────

const WEEKDAY_ABBR = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] // Sun–Sat

function buildMonthGrid(monthOffset: number): { days: Date[]; year: number; month: number } {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = target.getFullYear()
  const month = target.getMonth()
  const firstDay = new Date(year, month, 1)
  const startDay = new Date(year, month, 1 - firstDay.getDay())
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDay)
    d.setDate(startDay.getDate() + i)
    days.push(d)
  }
  return { days, year, month }
}

// ── MonthNav ──────────────────────────────────────────────────────────────────

function MonthNav({
  monthOffset,
  loading,
  onPrev,
  onNext,
  onToday,
  onPrevYear,
  onNextYear,
}: {
  monthOffset: number
  loading: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onPrevYear: () => void
  onNextYear: () => void
}) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const label = target.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const navBtn = 'shrink-0 text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 active:bg-gray-700 transition-colors select-none'

  return (
    <div className="flex flex-col gap-0.5" dir="ltr">
      <div className="flex items-center w-full">
        <button
          onClick={onNext}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-800 active:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors text-2xl leading-none select-none"
          aria-label="חודש הבא"
        >
          ‹
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
          <span className="text-sm text-gray-300 font-medium truncate">{label}</span>
          {loading && <span className="w-1.5 h-1.5 rounded-full acc-bg animate-pulse shrink-0" />}
          {monthOffset !== 0 && (
            <button
              onClick={onToday}
              className="shrink-0 text-xs px-2 py-0.5 rounded-full acc-nav-btn border transition-colors"
            >
              היום
            </button>
          )}
        </div>
        <button
          onClick={onPrev}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-800 active:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors text-2xl leading-none select-none"
          aria-label="חודש קודם"
        >
          ›
        </button>
      </div>
      <div className="flex items-center justify-between px-1">
        <button onClick={onNextYear} className={navBtn} aria-label="שנה הבאה">‹‹ שנה</button>
        <button onClick={onPrevYear} className={navBtn} aria-label="שנה קודמת">שנה ››</button>
      </div>
    </div>
  )
}

// ── MonthView ─────────────────────────────────────────────────────────────────

function MonthView({
  monthOffset,
  events,
  loading,
  onEventClick,
}: {
  monthOffset: number
  events: Array<{ event: CalendarEvent; person: Person; isGeneral: boolean }>
  loading: boolean
  onEventClick: (event: CalendarEvent, person: Person) => void
}) {
  const { days, year, month } = useMemo(() => buildMonthGrid(monthOffset), [monthOffset])
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  // Reset selected day when month changes
  useEffect(() => { setSelectedDay(null) }, [monthOffset])

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return []
    return events
      .filter(({ event }) => eventCoversDay(event, selectedDay))
      .sort((a, b) => {
        const aAllDay = !!a.event.start.date
        const bAllDay = !!b.event.start.date
        if (aAllDay && !bAllDay) return -1
        if (!aAllDay && bAllDay) return 1
        const da = getEventDate(a.event)
        const db = getEventDate(b.event)
        if (!da) return -1
        if (!db) return 1
        return da.getTime() - db.getTime()
      })
  }, [selectedDay, events])

  return (
    <div className="flex flex-col gap-3">
      {/* Calendar grid */}
      <div className={`rounded-xl overflow-hidden ring-1 ring-gray-800 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 bg-surf border-b border-gray-800">
          {WEEKDAY_ABBR.map((abbr, i) => (
            <div key={i} className="py-2 text-center text-[11px] text-gray-600 font-medium">
              {abbr}
            </div>
          ))}
        </div>

        {/* Day cells — 6 rows × 7 cols */}
        <div className="grid grid-cols-7 bg-base">
          {days.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === month && day.getFullYear() === year
            const isToday = isSameDay(day, today)
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
            const dayEvents = events.filter(({ event }) => eventCoversDay(event, day))
            const isHoliday = isCurrentMonth && hasHoliday(day)
            const dotSlots = dayEvents.slice(0, isHoliday ? 2 : 3)
            const extra = dayEvents.length - dotSlots.length

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(isSelected ? null : new Date(day))}
                className={`min-h-[52px] p-1 flex flex-col items-center gap-0.5 border-b border-r border-gray-800/50 transition-colors
                  ${isSelected ? 'acc-bg-faint' : isHoliday ? 'bg-amber-950/10 hover:bg-amber-950/20' : 'hover:bg-gray-800/30 active:bg-gray-800/50'}
                  ${!isCurrentMonth ? 'opacity-25' : ''}
                `}
              >
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium
                    ${isToday ? 'acc-bg text-white' : isSelected ? 'acc-text font-semibold' : isHoliday ? 'text-amber-300' : 'text-gray-400'}
                  `}
                >
                  {day.getDate()}
                </span>
                <div className="flex flex-wrap gap-0.5 justify-center min-h-[10px]">
                  {isHoliday && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />}
                  {dotSlots.map(({ person }, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: person.color }} />
                  ))}
                  {extra > 0 && (
                    <span className="text-[9px] text-gray-600 leading-tight">+{extra}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day event list */}
      {selectedDay && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 px-1">
            {selectedDay.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {getHolidaysForDay(selectedDay).length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {getHolidaysForDay(selectedDay).map((h, i) => <HolidayChip key={i} holiday={h} />)}
            </div>
          )}
          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-gray-600 italic px-1">אין אירועים ביום זה</p>
          ) : (
            <div
              className={`rounded-xl overflow-hidden ring-1 divide-y divide-gray-800/50
                ${isSameDay(selectedDay, today) ? 'acc-ring acc-bg-faint' : 'ring-gray-800 bg-surf-40'}
              `}
            >
              {selectedDayEvents.map(({ event, person, isGeneral }) => (
                <AgendaEventRow
                  key={event.id}
                  event={event}
                  person={person}
                  isGeneral={isGeneral}
                  onClick={() => onEventClick(event, person)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { status, error: authError, isAuthorized, signIn, signOut, getAccessToken } =
    useGoogleAuth()

  const { canInstall, install } = useInstallPrompt()

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('mha_theme')
    return THEMES.find(t => t.id === saved) ?? DEFAULT_THEME
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme.id
    localStorage.setItem('mha_theme', theme.id)
  }, [theme])

  const [weekOffset, setWeekOffset] = useState(0)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [monthOffset, setMonthOffset] = useState(0)

  const switchToMonth = () => {
    const now = new Date()
    const sunday = new Date(now)
    sunday.setDate(now.getDate() - now.getDay() + weekOffset * 7)
    const newMonthOffset =
      (sunday.getFullYear() - now.getFullYear()) * 12 + (sunday.getMonth() - now.getMonth())
    setMonthOffset(newMonthOffset)
    setViewMode('month')
  }

  const switchToWeek = () => {
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const nowSunday = new Date(now)
    nowSunday.setDate(now.getDate() - now.getDay())
    nowSunday.setHours(0, 0, 0, 0)
    const targetSunday = new Date(target)
    targetSunday.setDate(target.getDate() - target.getDay())
    targetSunday.setHours(0, 0, 0, 0)
    const newWeekOffset = Math.round(
      (targetSunday.getTime() - nowSunday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    setWeekOffset(newWeekOffset)
    setViewMode('week')
  }

  const { events, loading, error: calError, refetch } = useCalendarEvents({
    isAuthorized,
    getAccessToken,
    onTokenExpired: signOut,
    weekOffset,
  })

  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<{ event: CalendarEvent; person: Person } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hasScrolledToTodayRef = useRef(false)

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus()
  }, [isSearchOpen])

  const toggleSearch = () => {
    if (isSearchOpen) { setIsSearchOpen(false); setSearchQuery('') }
    else setIsSearchOpen(true)
  }

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  // Scroll to today (centered) after events finish loading.
  // A spacer below the day list (see main render) guarantees there's always
  // enough room to center even when today is near the end of the week
  // (e.g. Friday/Saturday) — otherwise 'center' would clamp and barely move.
  // Uses a ref to avoid re-scrolling on every refresh or re-render.
  useEffect(() => {
    if (!isAuthorized) {
      hasScrolledToTodayRef.current = false
      return
    }
    if (weekOffset !== 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      hasScrolledToTodayRef.current = false
      return
    }
    // Wait for events to load so the layout is stable before scrolling.
    if (loading || hasScrolledToTodayRef.current) return
    const todayEl = document.getElementById('today-section')
    if (todayEl) {
      todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      hasScrolledToTodayRef.current = true
    }
  }, [weekOffset, isAuthorized, loading])

  const applyThemeColor = (person: Person): Person => {
    const c = theme.personColors[person.id as keyof typeof theme.personColors]
    return c ? { ...person, color: c } : person
  }

  const classifiedEvents = useMemo(
    () =>
      events.map(event => {
        const person = classifyEvent(event.summary ?? '')
        return { event, person: applyThemeColor(person), isGeneral: isGeneralEvent(event.summary ?? '', person) }
      }),
    [events, theme] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const filteredEvents = useMemo(
    () =>
      activeFilter === null
        ? classifiedEvents
        : classifiedEvents.filter(e => e.person.id === activeFilter),
    [classifiedEvents, activeFilter]
  )

  // ── Search across the full calendar via Google API ────────────────────────
  const {
    events: rawSearchEvents,
    loading: searchLoading,
    loadingMore,
    error: searchError,
    hasMore,
    loadMore,
  } = useSearchEvents({
    query: searchQuery,
    isAuthorized,
    getAccessToken,
    onTokenExpired: signOut,
  })

  const classifiedSearchEvents = useMemo(
    () =>
      rawSearchEvents.map(event => {
        const person = classifyEvent(event.summary ?? '')
        return { event, person: applyThemeColor(person), isGeneral: isGeneralEvent(event.summary ?? '', person) }
      }),
    [rawSearchEvents, theme] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const filteredSearchEvents = useMemo(
    () =>
      activeFilter === null
        ? classifiedSearchEvents
        : classifiedSearchEvents.filter(e => e.person.id === activeFilter),
    [classifiedSearchEvents, activeFilter]
  )

  // ── Month view data ───────────────────────────────────────────────────────
  const {
    events: monthEvents,
    loading: monthLoading,
    error: monthError,
    refetch: refetchMonth,
  } = useMonthEvents({
    isAuthorized,
    getAccessToken,
    onTokenExpired: signOut,
    monthOffset,
    enabled: viewMode === 'month',
  })

  const classifiedMonthEvents = useMemo(
    () =>
      monthEvents.map(event => {
        const person = classifyEvent(event.summary ?? '')
        return { event, person: applyThemeColor(person), isGeneral: isGeneralEvent(event.summary ?? '', person) }
      }),
    [monthEvents, theme] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const filteredMonthEvents = useMemo(
    () =>
      activeFilter === null
        ? classifiedMonthEvents
        : classifiedMonthEvents.filter(e => e.person.id === activeFilter),
    [classifiedMonthEvents, activeFilter]
  )

  const dayGroups = useMemo(
    () =>
      weekDays.map(day => ({
        day,
        events: filteredEvents
          .filter(({ event }) => eventCoversDay(event, day))
          .sort((a, b) => {
            // All-day events sort before timed events
            const aAllDay = !!a.event.start.date
            const bAllDay = !!b.event.start.date
            if (aAllDay && !bAllDay) return -1
            if (!aAllDay && bAllDay) return 1
            const da = getEventDate(a.event)
            const db = getEventDate(b.event)
            if (!da) return -1
            if (!db) return 1
            return da.getTime() - db.getTime()
          }),
      })),
    [weekDays, filteredEvents]
  )

  return (
    <div className="min-h-screen bg-base text-gray-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-base-95 backdrop-blur">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold acc-text">ניהול הבית</h1>
          <div className="flex items-center gap-2">
            {canInstall && (
              <button
                onClick={install}
                className="text-xs px-2 py-1 rounded bg-indigo-900/60 hover:bg-indigo-800/60 text-indigo-300 border border-indigo-700/50 transition-colors"
              >
                ⬇ התקן
              </button>
            )}
            {isAuthorized && (
              <button
                onClick={refetch}
                disabled={loading}
                className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 disabled:opacity-40 transition-colors"
              >
                {loading ? '...' : 'רענן'}
              </button>
            )}
            <ThemePicker theme={theme} onChange={setTheme} />
            {isAuthorized && (
              <button
                onClick={toggleSearch}
                className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                  isSearchOpen
                    ? 'acc-bg text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                }`}
                aria-label="חיפוש"
              >
                <SearchIcon className="w-4 h-4" />
              </button>
            )}
            {isAuthorized ? (
              <button
                onClick={signOut}
                className="text-sm px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                התנתק
              </button>
            ) : (
              <button
                onClick={signIn}
                disabled={status === 'loading' || status === 'refreshing'}
                className="text-sm px-3 py-1.5 rounded-md acc-btn disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'loading' || status === 'refreshing' ? 'מתחבר...' : 'התחבר עם Google'}
              </button>
            )}
          </div>
        </div>

        {/* Search bar */}
        {isSearchOpen && isAuthorized && (
          <div className="px-4 pb-3">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש אירועים..."
                dir="rtl"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-base leading-none"
                  aria-label="נקה חיפוש"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {/* Errors */}
        {(authError || calError || (isSearchOpen && searchError)) && (
          <p className="text-red-400 text-sm">שגיאה: {authError ?? calError ?? searchError}</p>
        )}

        {/* Silent re-auth in progress */}
        {!isAuthorized && status === 'refreshing' && (
          <div className="flex-1 flex items-center justify-center pt-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Not signed in */}
        {!isAuthorized && status !== 'refreshing' && (
          <div className="flex-1 flex items-center justify-center text-center pt-16">
            <p className="text-gray-500 text-sm">ברוכים הבאים — הלוח המשפחתי</p>
          </div>
        )}

        {/* Search mode */}
        {isAuthorized && isSearchOpen && (
          <>
            {searchQuery.trim() ? (
              <>
                <FilterBar activeFilter={activeFilter} onFilter={setActiveFilter} />
                <SearchResults
                  events={filteredSearchEvents}
                  loading={searchLoading}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  onEventClick={(ev, p) => setSelectedEvent({ event: ev, person: p })}
                />
              </>
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-gray-600 text-sm text-center">הקלד שם, מיקום או כל מילה לחיפוש בכל היומן</p>
              </div>
            )}
          </>
        )}

        {/* Week / Month agenda */}
        {isAuthorized && !isSearchOpen && (
          <>
            {/* View toggle */}
            <div className="flex bg-surf rounded-xl p-0.5">
              <button
                onClick={switchToWeek}
                className={`flex-1 py-1.5 text-sm rounded-lg transition-colors ${
                  viewMode === 'week' ? 'acc-bg text-white font-medium' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                שבועי
              </button>
              <button
                onClick={switchToMonth}
                className={`flex-1 py-1.5 text-sm rounded-lg transition-colors ${
                  viewMode === 'month' ? 'acc-bg text-white font-medium' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                חודשי
              </button>
            </div>

            {viewMode === 'week' ? (
              <>
                <WeekNav
                  weekOffset={weekOffset}
                  days={weekDays}
                  loading={loading}
                  onPrev={() => setWeekOffset(o => o - 1)}
                  onNext={() => setWeekOffset(o => o + 1)}
                  onToday={() => setWeekOffset(0)}
                  onPrevMonth={() => setWeekOffset(o => offsetByPeriod(o, -1))}
                  onNextMonth={() => setWeekOffset(o => offsetByPeriod(o, 1))}
                  onPrevYear={() => setWeekOffset(o => offsetByPeriod(o, -12))}
                  onNextYear={() => setWeekOffset(o => offsetByPeriod(o, 12))}
                />
                <FilterBar activeFilter={activeFilter} onFilter={setActiveFilter} />
                <div className={`flex flex-col gap-3 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                  {dayGroups.map(({ day, events: dayEvents }) => (
                    <DaySection
                      key={day.toISOString()}
                      day={day}
                      events={dayEvents}
                      onEventClick={(ev, p) => setSelectedEvent({ event: ev, person: p })}
                    />
                  ))}
                </div>
                <div aria-hidden className="h-[50vh]" />
              </>
            ) : (
              <>
                <MonthNav
                  monthOffset={monthOffset}
                  loading={monthLoading}
                  onPrev={() => setMonthOffset(o => o - 1)}
                  onNext={() => setMonthOffset(o => o + 1)}
                  onToday={() => setMonthOffset(0)}
                  onPrevYear={() => setMonthOffset(o => o - 12)}
                  onNextYear={() => setMonthOffset(o => o + 12)}
                />
                {monthError && (
                  <p className="text-red-400 text-sm">שגיאה: {monthError}</p>
                )}
                <FilterBar activeFilter={activeFilter} onFilter={setActiveFilter} />
                <MonthView
                  monthOffset={monthOffset}
                  events={filteredMonthEvents}
                  loading={monthLoading}
                  onEventClick={(ev, p) => setSelectedEvent({ event: ev, person: p })}
                />
                {isAuthorized && (
                  <div className="flex justify-center pt-1">
                    <button
                      onClick={refetchMonth}
                      disabled={monthLoading}
                      className="text-xs px-3 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-500 disabled:opacity-40 transition-colors border border-gray-800"
                    >
                      {monthLoading ? '...' : 'רענן'}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent.event}
          person={selectedEvent.person}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

export default App

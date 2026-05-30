import { useState, useMemo, useEffect } from 'react'
import { useGoogleAuth } from './hooks/useGoogleAuth'
import { useCalendarEvents } from './hooks/useCalendarEvents'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { classifyEvent } from './utils/classifyEvent'
import type { CalendarEvent } from './services/calendarApi'
import type { Person } from './config/people'
import { PEOPLE, DEFAULT_OWNER_ID } from './config/people'

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
}: {
  weekOffset: number
  days: Date[]
  loading: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center w-full" dir="ltr">
      {/* Left arrow — fixed position */}
      <button
        onClick={onNext}
        className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-800 active:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors text-2xl leading-none select-none"
        aria-label="שבוע הבא"
      >
        ‹
      </button>

      {/* Center label — takes all remaining space, text always centered */}
      <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
        <span className="text-sm text-gray-300 font-medium truncate">
          {getWeekLabel(weekOffset, days)}
        </span>
        {loading && (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
        )}
        {weekOffset !== 0 && (
          <button
            onClick={onToday}
            className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-indigo-900/60 hover:bg-indigo-800/60 text-indigo-400 border border-indigo-700/50 transition-colors"
          >
            היום
          </button>
        )}
      </div>

      {/* Right arrow — fixed position */}
      <button
        onClick={onPrev}
        className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-800 active:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors text-2xl leading-none select-none"
        aria-label="שבוע הקודם"
      >
        ›
      </button>
    </div>
  )
}

// ── EventDetailModal ──────────────────────────────────────────────────────────

function EventDetailModal({ event, person, onClose }: { event: CalendarEvent; person: Person; onClose: () => void }) {
  const description = event.description ? stripHtml(event.description) : null
  const hasExtra = !!(description || event.location)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-2xl bg-gray-900 rounded-t-2xl border-t border-gray-700 p-5 pb-10"
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

  return (
    <div
      className={`rounded-xl overflow-hidden ${
        today ? 'ring-2 ring-indigo-500' : 'ring-1 ring-gray-800'
      }`}
    >
      {/* Day header */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${
          today ? 'bg-indigo-950/70' : 'bg-gray-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold text-sm ${today ? 'text-indigo-300' : 'text-gray-300'}`}
          >
            {formatWeekday(day)}
          </span>
          <span className="text-xs text-gray-500">{formatShortDate(day)}</span>
          {today && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-medium leading-none">
              היום
            </span>
          )}
        </div>
        {events.length > 0 && (
          <span className="text-xs text-gray-600">{events.length}</span>
        )}
      </div>

      {/* Event list */}
      <div
        className={`divide-y divide-gray-800/50 ${today ? 'bg-indigo-950/20' : 'bg-gray-900/40'}`}
      >
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

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { status, error: authError, isAuthorized, signIn, signOut, getAccessToken } =
    useGoogleAuth()

  const { canInstall, install } = useInstallPrompt()

  const [weekOffset, setWeekOffset] = useState(0)

  const { events, loading, error: calError, refetch } = useCalendarEvents({
    isAuthorized,
    getAccessToken,
    onTokenExpired: signOut,
    weekOffset,
  })

  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<{ event: CalendarEvent; person: Person } | null>(null)

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  // Scroll to top when switching weeks
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [weekOffset])

  const classifiedEvents = useMemo(
    () =>
      events.map(event => {
        const person = classifyEvent(event.summary ?? '')
        return { event, person, isGeneral: isGeneralEvent(event.summary ?? '', person) }
      }),
    [events]
  )

  const filteredEvents = useMemo(
    () =>
      activeFilter === null
        ? classifiedEvents
        : classifiedEvents.filter(e => e.person.id === activeFilter),
    [classifiedEvents, activeFilter]
  )

  const dayGroups = useMemo(
    () =>
      weekDays.map(day => ({
        day,
        events: filteredEvents
          .filter(({ event }) => {
            const d = getEventDate(event)
            return d ? isSameDay(d, day) : false
          })
          .sort((a, b) => {
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
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 px-4 py-3 flex items-center justify-between bg-gray-950/95 backdrop-blur">
        <h1 className="text-lg font-bold text-indigo-400">ניהול הבית</h1>
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
              disabled={status === 'loading'}
              className="text-sm px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'loading' ? 'מתחבר...' : 'התחבר עם Google'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {/* Errors */}
        {(authError || calError) && (
          <p className="text-red-400 text-sm">שגיאה: {authError ?? calError}</p>
        )}

        {/* Not signed in */}
        {!isAuthorized && (
          <div className="flex-1 flex items-center justify-center text-center pt-16">
            <p className="text-gray-500 text-sm">ברוכים הבאים — הלוח המשפחתי</p>
          </div>
        )}

        {/* Weekly agenda */}
        {isAuthorized && (
          <>
            <WeekNav
              weekOffset={weekOffset}
              days={weekDays}
              loading={loading}
              onPrev={() => setWeekOffset(o => o - 1)}
              onNext={() => setWeekOffset(o => o + 1)}
              onToday={() => setWeekOffset(0)}
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

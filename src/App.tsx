import { useState, useMemo } from 'react'
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

function getWeekDays(): Date[] {
  const today = new Date()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay())
  sunday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
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

// ── AgendaEventRow ────────────────────────────────────────────────────────────

function AgendaEventRow({
  event,
  person,
  isGeneral,
}: {
  event: CalendarEvent
  person: Person
  isGeneral: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-800/40 transition-colors">
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
    </div>
  )
}

// ── DaySection ────────────────────────────────────────────────────────────────

function DaySection({
  day,
  events,
}: {
  day: Date
  events: Array<{ event: CalendarEvent; person: Person; isGeneral: boolean }>
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

  const { events, loading, error: calError, refetch } = useCalendarEvents({
    isAuthorized,
    getAccessToken,
    onTokenExpired: signOut,
  })

  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const weekDays = useMemo(() => getWeekDays(), [])

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

        {/* Loading */}
        {isAuthorized && loading && (
          <p className="text-gray-500 text-sm animate-pulse">טוען אירועים...</p>
        )}

        {/* Weekly agenda */}
        {isAuthorized && !loading && (
          <>
            <FilterBar activeFilter={activeFilter} onFilter={setActiveFilter} />
            <div className="flex flex-col gap-3">
              {dayGroups.map(({ day, events: dayEvents }) => (
                <DaySection key={day.toISOString()} day={day} events={dayEvents} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App

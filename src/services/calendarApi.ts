export interface CalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  colorId?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
}

interface EventsResponse {
  items: CalendarEvent[]
}

function getWeekBounds(weekOffset = 0): { timeMin: string; timeMax: string } {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay() + weekOffset * 7)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}

export class AuthExpiredError extends Error {}

export async function fetchWeekEvents(accessToken: string, weekOffset = 0): Promise<CalendarEvent[]> {
  const { timeMin, timeMax } = getWeekBounds(weekOffset)
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (res.status === 401) throw new AuthExpiredError('token expired')
  if (!res.ok) throw new Error(`Calendar API error ${res.status}`)

  const data: EventsResponse = await res.json()
  return data.items ?? []
}

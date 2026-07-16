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

export async function fetchMonthEvents(accessToken: string, monthOffset = 0): Promise<CalendarEvent[]> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1)

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
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

export interface SearchEventsResult {
  events: CalendarEvent[]
  nextPageToken?: string
}

export async function searchEvents(
  accessToken: string,
  query: string,
  pageToken?: string,
): Promise<SearchEventsResult> {
  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setMonth(now.getMonth() - 6)
  const timeMax = new Date(now)
  timeMax.setFullYear(now.getFullYear() + 1)

  const params = new URLSearchParams({
    q: query,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  if (pageToken) params.set('pageToken', pageToken)

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (res.status === 401) throw new AuthExpiredError('token expired')
  if (!res.ok) throw new Error(`Calendar API error ${res.status}`)

  const data: EventsResponse & { nextPageToken?: string } = await res.json()
  return { events: data.items ?? [], nextPageToken: data.nextPageToken }
}

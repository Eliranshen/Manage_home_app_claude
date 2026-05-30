import { useState, useEffect, useCallback } from 'react'
import { fetchWeekEvents, AuthExpiredError, type CalendarEvent } from '../services/calendarApi'

interface UseCalendarEventsOptions {
  isAuthorized: boolean
  getAccessToken: () => string | null
  onTokenExpired: () => void
}

interface CalendarEventsState {
  events: CalendarEvent[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useCalendarEvents({
  isAuthorized,
  getAccessToken,
  onTokenExpired,
}: UseCalendarEventsOptions): CalendarEventsState {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const data = await fetchWeekEvents(token)
      setEvents(data)
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        onTokenExpired()
      } else {
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת היומן')
      }
    } finally {
      setLoading(false)
    }
  }, [getAccessToken, onTokenExpired])

  useEffect(() => {
    if (isAuthorized) {
      fetch()
    } else {
      setEvents([])
      setError(null)
    }
  }, [isAuthorized, fetch])

  return { events, loading, error, refetch: fetch }
}

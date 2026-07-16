import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchWeekEvents, AuthExpiredError, type CalendarEvent } from '../services/calendarApi'

interface UseCalendarEventsOptions {
  isAuthorized: boolean
  getAccessToken: () => string | null
  onTokenExpired: () => void
  weekOffset: number
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
  weekOffset,
}: UseCalendarEventsOptions): CalendarEventsState {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  // Starts true (not false): the fetch effect below only flips it to true
  // AFTER the first render, so a false initial value lets consumers see a
  // "not loading" state for one render before the fetch has even started.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cacheRef = useRef<Map<number, CalendarEvent[]>>(new Map())
  // Monotonic counter — lets in-flight requests detect they've been superseded.
  const fetchIdRef = useRef(0)

  const doFetch = useCallback(
    async (offset: number, silent = false) => {
      const token = getAccessToken()
      if (!token) return

      // Cache hit → instant, no network needed
      const cached = cacheRef.current.get(offset)
      if (cached) {
        if (!silent) setEvents(cached)
        return
      }

      if (silent) {
        // Background prefetch — only populate the cache, never touch React state
        try {
          const data = await fetchWeekEvents(token, offset)
          cacheRef.current.set(offset, data)
        } catch {
          // ignore background errors
        }
        return
      }

      // Foreground fetch
      const id = ++fetchIdRef.current
      setLoading(true)
      setError(null)
      setEvents([]) // clear stale events — isSameDay filtering would hide them anyway

      try {
        const data = await fetchWeekEvents(token, offset)
        cacheRef.current.set(offset, data)
        if (id === fetchIdRef.current) setEvents(data)
      } catch (err) {
        if (id === fetchIdRef.current) {
          if (err instanceof AuthExpiredError) {
            onTokenExpired()
          } else {
            setError(err instanceof Error ? err.message : 'שגיאה בטעינת היומן')
          }
        }
      } finally {
        if (id === fetchIdRef.current) setLoading(false)
      }
    },
    [getAccessToken, onTokenExpired],
  )

  // Fetch the current week
  useEffect(() => {
    if (isAuthorized) {
      doFetch(weekOffset)
    } else {
      cacheRef.current.clear()
      setEvents([])
      setError(null)
    }
  }, [isAuthorized, doFetch, weekOffset])

  // Silently prefetch adjacent weeks so navigating there is instant
  useEffect(() => {
    if (!isAuthorized) return
    doFetch(weekOffset - 1, true)
    doFetch(weekOffset + 1, true)
  }, [isAuthorized, doFetch, weekOffset])

  const refetch = useCallback(() => {
    cacheRef.current.delete(weekOffset)
    doFetch(weekOffset)
  }, [doFetch, weekOffset])

  return { events, loading, error, refetch }
}

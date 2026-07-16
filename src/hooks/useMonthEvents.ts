import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchMonthEvents, AuthExpiredError, type CalendarEvent } from '../services/calendarApi'

interface Options {
  isAuthorized: boolean
  getAccessToken: () => string | null
  onTokenExpired: () => void
  monthOffset: number
  enabled: boolean
}

export function useMonthEvents({ isAuthorized, getAccessToken, onTokenExpired, monthOffset, enabled }: Options) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<Map<number, CalendarEvent[]>>(new Map())
  const fetchIdRef = useRef(0)

  const doFetch = useCallback(async (offset: number) => {
    const token = getAccessToken()
    if (!token) return

    const cached = cacheRef.current.get(offset)
    if (cached) { setEvents(cached); return }

    const id = ++fetchIdRef.current
    setLoading(true)
    setError(null)
    setEvents([])

    try {
      const data = await fetchMonthEvents(token, offset)
      cacheRef.current.set(offset, data)
      if (id === fetchIdRef.current) setEvents(data)
    } catch (err) {
      if (id === fetchIdRef.current) {
        if (err instanceof AuthExpiredError) onTokenExpired()
        else setError(err instanceof Error ? err.message : 'שגיאה בטעינת היומן')
      }
    } finally {
      if (id === fetchIdRef.current) setLoading(false)
    }
  }, [getAccessToken, onTokenExpired])

  useEffect(() => {
    if (!isAuthorized || !enabled) {
      if (!isAuthorized) cacheRef.current.clear()
      setEvents([])
      setError(null)
      return
    }
    doFetch(monthOffset)
  }, [isAuthorized, enabled, doFetch, monthOffset])

  const refetch = useCallback(() => {
    cacheRef.current.delete(monthOffset)
    doFetch(monthOffset)
  }, [doFetch, monthOffset])

  return { events, loading, error, refetch }
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { searchEvents, AuthExpiredError, type CalendarEvent } from '../services/calendarApi'

interface UseSearchEventsOptions {
  query: string
  isAuthorized: boolean
  getAccessToken: () => string | null
  onTokenExpired: () => void
}

export interface SearchEventsState {
  events: CalendarEvent[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

export function useSearchEvents({
  query,
  isAuthorized,
  getAccessToken,
  onTokenExpired,
}: UseSearchEventsOptions): SearchEventsState {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()

  const fetchIdRef = useRef(0)
  // Keeps the active query and page token accessible inside loadMore without
  // adding them to doSearch's dependency array (which would cause re-renders).
  const activeQueryRef = useRef('')
  const nextPageTokenRef = useRef<string | undefined>()

  const doSearch = useCallback(
    async (q: string, pageToken?: string) => {
      const token = getAccessToken()
      if (!token) return

      const id = ++fetchIdRef.current
      const isAppend = !!pageToken

      if (isAppend) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setError(null)
        setEvents([])
        setNextPageToken(undefined)
        nextPageTokenRef.current = undefined
      }

      try {
        const result = await searchEvents(token, q, pageToken)
        if (id !== fetchIdRef.current) return

        setEvents(prev => (isAppend ? [...prev, ...result.events] : result.events))
        setNextPageToken(result.nextPageToken)
        nextPageTokenRef.current = result.nextPageToken
      } catch (err) {
        if (id !== fetchIdRef.current) return
        if (err instanceof AuthExpiredError) onTokenExpired()
        else setError(err instanceof Error ? err.message : 'שגיאה בחיפוש')
      } finally {
        if (id === fetchIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [getAccessToken, onTokenExpired],
  )

  useEffect(() => {
    if (!isAuthorized || !query.trim()) {
      setEvents([])
      setError(null)
      setNextPageToken(undefined)
      nextPageTokenRef.current = undefined
      activeQueryRef.current = ''
      return
    }

    activeQueryRef.current = query
    const timer = setTimeout(() => doSearch(query), 400)
    return () => clearTimeout(timer)
  }, [query, isAuthorized, doSearch])

  const loadMore = useCallback(() => {
    if (!nextPageTokenRef.current || loadingMore || !activeQueryRef.current) return
    doSearch(activeQueryRef.current, nextPageTokenRef.current)
  }, [loadingMore, doSearch])

  return { events, loading, loadingMore, error, hasMore: !!nextPageToken, loadMore }
}

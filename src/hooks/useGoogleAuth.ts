import { useState, useCallback, useRef, useEffect } from 'react'

type AuthStatus = 'idle' | 'loading' | 'authorized' | 'error' | 'refreshing'
// 'refreshing' = silently attempting re-auth; user was previously logged in

interface TokenState {
  accessToken: string
  expiresAt: number
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = 'mha_token'
const HAD_AUTH_KEY = 'mha_had_auth' // persists across token expiry; cleared only on explicit logout

// Migrate previous sessions that only stored a flag (old 'mha_auth' key)
localStorage.removeItem('mha_auth')

function loadStoredToken(): TokenState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as TokenState
    if (Date.now() >= t.expiresAt) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return t
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function saveToken(t: TokenState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)) } catch { /* private-mode quota */ }
}

function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function hadPreviousAuth(): boolean {
  return localStorage.getItem(HAD_AUTH_KEY) === '1'
}

function markHadAuth(): void {
  try { localStorage.setItem(HAD_AUTH_KEY, '1') } catch {}
}

function clearHadAuth(): void {
  localStorage.removeItem(HAD_AUTH_KEY)
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useGoogleAuth() {
  const tokenRef = useRef<TokenState | null>(null)
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null)
  const silentAttemptedRef = useRef(false)
  const statusRef = useRef<AuthStatus>('idle')

  // Restore token on first render. If the token is expired but the user was
  // previously logged in, start in 'refreshing' to attempt silent re-auth
  // before ever showing the login screen.
  const [status, setStatus] = useState<AuthStatus>(() => {
    const stored = loadStoredToken()
    if (stored) {
      tokenRef.current = stored
      statusRef.current = 'authorized'
      return 'authorized'
    }
    if (hadPreviousAuth()) {
      statusRef.current = 'refreshing'
      return 'refreshing'
    }
    return 'idle'
  })
  const [error, setError] = useState<string | null>(null)

  const setStatusTracked = useCallback((s: AuthStatus) => {
    statusRef.current = s
    setStatus(s)
  }, [])

  const getClient = useCallback((): google.accounts.oauth2.TokenClient => {
    if (clientRef.current) return clientRef.current

    clientRef.current = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      callback: (response) => {
        if (response.error) {
          clearToken()
          tokenRef.current = null
          setError(response.error_description ?? response.error)
          setStatusTracked('error')
          return
        }
        const t: TokenState = {
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000,
        }
        tokenRef.current = t
        saveToken(t)
        markHadAuth()
        setError(null)
        setStatusTracked('authorized')
      },
      error_callback: (err) => {
        // Closed / blocked popup — fall back gracefully without showing an error.
        if (err.type === 'popup_closed' || err.type === 'popup_failed_to_open') {
          if (!loadStoredToken()) setStatusTracked('idle')
        } else {
          clearToken()
          tokenRef.current = null
          setError(err.message ?? err.type)
          setStatusTracked('error')
        }
      },
    })

    return clientRef.current
  }, [setStatusTracked])

  // On startup (or after a visibilitychange reset): if status is 'refreshing',
  // attempt a silent re-auth. On Android Chrome this completes without any UI.
  // On iOS it may show a brief Google popup but avoids a full manual login.
  useEffect(() => {
    if (status !== 'refreshing' || silentAttemptedRef.current) return
    silentAttemptedRef.current = true

    let cancelled = false

    // Fallback: if silent re-auth doesn't resolve within 3s, unlock the login button.
    const fallback = setTimeout(() => {
      if (!cancelled && statusRef.current === 'refreshing') setStatusTracked('idle')
    }, 3000)

    const attempt = () => {
      if (cancelled) return
      if (typeof google === 'undefined' || !google.accounts?.oauth2) {
        setTimeout(attempt, 250)
        return
      }
      getClient().requestAccessToken({ prompt: '' })
    }
    attempt()
    return () => { cancelled = true; clearTimeout(fallback) }
  }, [status, getClient, setStatusTracked])

  // Proactive silent refresh — fires 5 minutes before the stored token expires.
  useEffect(() => {
    if (status !== 'authorized' || !tokenRef.current) return

    const msUntilRefresh = tokenRef.current.expiresAt - Date.now() - 5 * 60 * 1000

    const doRefresh = () => {
      if (typeof google === 'undefined' || !google.accounts?.oauth2) return
      getClient().requestAccessToken({ prompt: '' })
    }

    if (msUntilRefresh <= 0) {
      doRefresh()
      return
    }

    const timer = setTimeout(doRefresh, msUntilRefresh)
    return () => clearTimeout(timer)
  }, [status, getClient])

  // When the app comes back to the foreground (e.g. switching from another app),
  // check if the token needs refreshing and attempt silently.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return

      // Token exists but near expiry → silent background refresh
      if (tokenRef.current) {
        const msLeft = tokenRef.current.expiresAt - Date.now()
        if (msLeft < 5 * 60 * 1000 && typeof google !== 'undefined' && google.accounts?.oauth2) {
          getClient().requestAccessToken({ prompt: '' })
        }
        return
      }

      // No token but we know the user was logged in → attempt silent re-auth
      if (
        hadPreviousAuth() &&
        statusRef.current !== 'loading' &&
        statusRef.current !== 'refreshing' &&
        statusRef.current !== 'authorized'
      ) {
        silentAttemptedRef.current = false
        setStatusTracked('refreshing')
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [getClient, setStatusTracked])

  const signIn = useCallback(() => {
    setStatusTracked('loading')
    setError(null)
    getClient().requestAccessToken()
  }, [getClient, setStatusTracked])

  const signOut = useCallback(() => {
    const token = tokenRef.current?.accessToken
    tokenRef.current = null
    clearToken()
    clearHadAuth()
    setStatusTracked('idle')
    setError(null)
    if (token && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(token, () => {})
    }
  }, [setStatusTracked])

  const getAccessToken = useCallback((): string | null => {
    const t = tokenRef.current
    if (!t) return null
    if (Date.now() >= t.expiresAt) {
      clearToken()
      tokenRef.current = null
      setStatusTracked('idle')
      return null
    }
    return t.accessToken
  }, [setStatusTracked])

  const isAuthorized =
    status === 'authorized' &&
    tokenRef.current !== null &&
    Date.now() < (tokenRef.current?.expiresAt ?? 0)

  return { status, error, isAuthorized, signIn, signOut, getAccessToken }
}

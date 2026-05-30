import { useState, useCallback, useRef, useEffect } from 'react'

type AuthStatus = 'idle' | 'loading' | 'authorized' | 'error'

interface TokenState {
  accessToken: string
  expiresAt: number
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = 'mha_token'

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

// ── hook ───────────────────────────────────────────────────────────────────────

export function useGoogleAuth() {
  const tokenRef = useRef<TokenState | null>(null)
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null)

  // Restore token from localStorage on first render — calendar shows immediately
  // without waiting for GIS or any network request.
  const [status, setStatus] = useState<AuthStatus>(() => {
    const stored = loadStoredToken()
    if (stored) tokenRef.current = stored
    return stored ? 'authorized' : 'idle'
  })
  const [error, setError] = useState<string | null>(null)

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
          setStatus('error')
          return
        }
        const t: TokenState = {
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000,
        }
        tokenRef.current = t
        saveToken(t)
        setError(null)
        setStatus('authorized')
      },
      error_callback: (err) => {
        // Closed / blocked popup during a silent background refresh.
        // Only fall back to idle if we no longer have a valid stored token.
        if (err.type === 'popup_closed' || err.type === 'popup_failed_to_open') {
          if (!loadStoredToken()) setStatus('idle')
        } else {
          clearToken()
          tokenRef.current = null
          setError(err.message ?? err.type)
          setStatus('error')
        }
      },
    })

    return clientRef.current
  }, [])

  // Proactive silent refresh — fires 5 minutes before the stored token expires.
  // On Android/Chrome this succeeds silently. On iOS it may open a brief popup,
  // but only once every ~55 minutes, not on every app open.
  useEffect(() => {
    if (status !== 'authorized' || !tokenRef.current) return

    const msUntilRefresh = tokenRef.current.expiresAt - Date.now() - 5 * 60 * 1000

    const doRefresh = () => {
      if (typeof google === 'undefined' || !google.accounts?.oauth2) return
      getClient().requestAccessToken({ prompt: '' })
    }

    if (msUntilRefresh <= 0) {
      // Token already near expiry (e.g. app was backgrounded) — refresh now
      doRefresh()
      return
    }

    const timer = setTimeout(doRefresh, msUntilRefresh)
    return () => clearTimeout(timer)
  }, [status, getClient])

  const signIn = useCallback(() => {
    setStatus('loading')
    setError(null)
    getClient().requestAccessToken()
  }, [getClient])

  const signOut = useCallback(() => {
    const token = tokenRef.current?.accessToken
    tokenRef.current = null
    clearToken()
    setStatus('idle')
    setError(null)
    if (token && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(token, () => {})
    }
  }, [])

  const getAccessToken = useCallback((): string | null => {
    const t = tokenRef.current
    if (!t) return null
    if (Date.now() >= t.expiresAt) {
      clearToken()
      tokenRef.current = null
      setStatus('idle')
      return null
    }
    return t.accessToken
  }, [])

  const isAuthorized =
    status === 'authorized' &&
    tokenRef.current !== null &&
    Date.now() < (tokenRef.current?.expiresAt ?? 0)

  return { status, error, isAuthorized, signIn, signOut, getAccessToken }
}

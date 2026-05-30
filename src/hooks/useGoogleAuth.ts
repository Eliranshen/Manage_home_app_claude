import { useState, useCallback, useRef } from 'react'

type AuthStatus = 'idle' | 'loading' | 'authorized' | 'error'

interface TokenState {
  accessToken: string
  expiresAt: number
}

export function useGoogleAuth() {
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<TokenState | null>(null)
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null)

  const getClient = useCallback((): google.accounts.oauth2.TokenClient => {
    if (clientRef.current) return clientRef.current

    clientRef.current = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      callback: (response) => {
        if (response.error) {
          tokenRef.current = null
          setError(response.error_description ?? response.error)
          setStatus('error')
          return
        }
        tokenRef.current = {
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000,
        }
        setError(null)
        setStatus('authorized')
      },
      error_callback: (err) => {
        tokenRef.current = null
        if (err.type === 'popup_closed') {
          // User closed the consent window — not an error, just cancelled
          setStatus('idle')
        } else {
          setError(err.message ?? err.type)
          setStatus('error')
        }
      },
    })

    return clientRef.current
  }, [])

  const signIn = useCallback(() => {
    setStatus('loading')
    setError(null)
    getClient().requestAccessToken()
  }, [getClient])

  const signOut = useCallback(() => {
    const token = tokenRef.current?.accessToken
    tokenRef.current = null
    setStatus('idle')
    setError(null)
    if (token) {
      google.accounts.oauth2.revoke(token, () => {})
    }
  }, [])

  const getAccessToken = useCallback((): string | null => {
    const t = tokenRef.current
    if (!t) return null
    if (Date.now() >= t.expiresAt) {
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

declare namespace google.accounts.oauth2 {
  interface TokenClientConfig {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: ClientConfigError) => void
    prompt?: string
  }

  interface TokenResponse {
    access_token: string
    expires_in: string
    token_type: string
    scope: string
    error?: string
    error_description?: string
  }

  interface ClientConfigError {
    type: string
    message?: string
  }

  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string }): void
  }

  function initTokenClient(config: TokenClientConfig): TokenClient
  function revoke(accessToken: string, done: () => void): void
}

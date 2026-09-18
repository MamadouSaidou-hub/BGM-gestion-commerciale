const NETWORK_ERROR_MESSAGE = 'Connexion instable — impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

function isNetworkFailure(error: unknown) {
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * fetch() + res.json(), but resilient to a flaky connection: retries once on a network failure
 * (dropped connection, timeout) with a short backoff, and always throws a clear French message
 * instead of leaving a caller's loading state stuck forever or failing silently.
 */
export async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  { retries = 1, timeoutMs = 15_000 }: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs)
      if (!res.ok) {
        let message = `Erreur ${res.status}`
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // Non-JSON error body — keep the generic status-based message.
        }
        throw new Error(message)
      }
      return (await res.json()) as T
    } catch (error) {
      lastError = error
      if (!isNetworkFailure(error) || attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
    }
  }

  if (isNetworkFailure(lastError)) throw new Error(NETWORK_ERROR_MESSAGE)
  throw lastError instanceof Error ? lastError : new Error('Erreur inconnue.')
}

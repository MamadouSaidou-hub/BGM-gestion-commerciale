'use client'

import { useEffect, useRef } from 'react'

/**
 * iOS treats an "Add to Home Screen" app differently from a normal Safari tab: reopening it often
 * restores a cached snapshot from memory instead of hitting the network, so a client can sit on a
 * deploy from days ago with no way to tell. There's no server header that fixes this — iOS's own
 * cache decides, not ours — so instead the app checks for itself: every time it becomes visible
 * again, it asks the server for the current build id and reloads if it has changed.
 *
 * `pageshow` with `event.persisted === true` is the specific signal that the page was restored
 * from the back-forward cache (exactly the "reopened from the home screen icon" case on iOS) —
 * the most reliable trigger available. `visibilitychange` is a second net for cases where iOS
 * resumes the app without firing a full `pageshow`.
 */
export function PwaUpdateWatcher() {
  const knownVersion = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchVersion(): Promise<string | null> {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return null
        const json = await res.json()
        return json.version ?? null
      } catch {
        return null
      }
    }

    async function checkForUpdate() {
      const version = await fetchVersion()
      if (cancelled || !version) return
      if (knownVersion.current === null) {
        knownVersion.current = version
        return
      }
      if (version !== knownVersion.current) {
        window.location.reload()
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) checkForUpdate()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    checkForUpdate()
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}

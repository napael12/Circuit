import { useEffect, useRef, useState } from 'react'

interface DatastoreSocketResult {
  data: unknown
  /** Server-recorded refresh time carried on every push (see datastore/consumers.py). */
  lastRunAt: string | null
}

/** Subscribes to a scheduled Datastore's push channel (see datastore/consumers.py). */
export function useDatastoreSocket(datastoreId: string | undefined): DatastoreSocketResult {
  const [data, setData] = useState<unknown>(undefined)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!datastoreId) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${proto}://${window.location.host}/ws/datastore/${datastoreId}/`)
    socketRef.current = socket
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      setData(payload.data)
      setLastRunAt(payload.last_run_at ?? null)
    }
    return () => socket.close()
  }, [datastoreId])

  return { data, lastRunAt }
}

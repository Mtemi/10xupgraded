import { useState, useEffect } from 'react'
import { useFreqtradeWS, type FreqtradeEvent } from './useFreqtradeWS'

export interface BotStatus {
  status: string            // 'unknown'|'pending'|'starting'|'running'|'stopping'|'stopped'|'failed'|'not deployed'|'error'
  running: boolean
  openTradesCount?: number
  ready?: boolean           // pod ready
  phase?: string            // pod.phase raw
  reason?: string           // pod.reason if any
}

/**
 * Polls pod + health + trades, and subscribes to WS events
 * to maintain an up-to-date BotStatus.
 */
export function useBotStatus(
  strategyName: string,
  userId: string,
  // heartbeatInterval in seconds (matches Freqtrade internals.heartbeat_interval; default 60)
  heartbeatInterval = 60,
  // multiplier for staleness threshold (default 2× interval = 120s)
  thresholdMultiplier = 2
): BotStatus {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    status: 'unknown',
    running: false,
    openTradesCount: 0,
    ready: false,
    phase: undefined,
    reason: undefined
  })

  // compute threshold in seconds
  const stalenessThreshold = heartbeatInterval * thresholdMultiplier

  // fetch pod status, health timestamp, trades count
  const fetchAll = async () => {
    try {
      // 1) Pod status
      const podRes = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${userId}`)
      if (!podRes.ok) throw new Error('Pod status fetch failed')
      const pod = await podRes.json()

      // derive interim phase/status (before health)
      let statusText = 'unknown'
      if (pod.phase === 'Pending')             statusText = 'pending'
      else if (pod.phase === 'Failed')          statusText = 'failed'
      else if (pod.phase === 'NotFound')        statusText = 'not deployed'
      else if (pod.phase === 'Running' && !pod.ready)
                                                statusText = 'starting'
      // if pod.ready, we'll refine based on health…
      
      // 2) Bot health (REST)
      let isRunning = false
      try {
        const healthRes = await fetch(
          `/user/${strategyName}/api/v1/health`,
          {
            headers: {
              Authorization: 'Basic ' + btoa(`meghan:${userId}`)
            }
          }
        )
        if (healthRes.ok) {
          const { last_process_ts } = await healthRes.json() as {
            last_process_ts: number
          }
          const nowTs = Math.floor(Date.now() / 1000)
          const age = nowTs - last_process_ts

          if (age < stalenessThreshold) {
            // heartbeat fresh → bot is running
            isRunning = true
            statusText = 'running'
          } else {
            // heartbeat stale → bot is stopped or hung
            isRunning = false
            statusText = 'stopped'
          }
        }
      } catch (err) {
        console.error('[useBotStatus] Health check error:', err)
      }

      // 3) Open trades count (only if pod ready)
      let tradesCount = 0
      if (pod.ready) {
        try {
          const tradesRes = await fetch(
            `/user/${strategyName}/api/v1/status`,
            {
              headers: {
                Authorization: 'Basic ' + btoa(`meghan:${userId}`)
              }
            }
          )
          if (tradesRes.ok) {
            const data = await tradesRes.json()
            tradesCount = Array.isArray(data)
              ? data.length
              : Array.isArray(data?.open_trades)
                ? data.open_trades.length
                : 0
          }
        } catch (err) {
          console.error('[useBotStatus] Error fetching trades count:', err)
        }
      }

      // 4) Commit all into state
      setBotStatus({
        status:    statusText,
        running:   isRunning,
        openTradesCount: tradesCount,
        ready:     Boolean(pod.ready),
        phase:     pod.phase,
        reason:    pod.reason
      })

    } catch (err) {
      console.error('[useBotStatus] fetchAll error:', err)
      setBotStatus({
        status:  'error',
        running: false
      })
    }
  }

  // initial + periodic polling (every 10s)
  useEffect(() => {
    if (!strategyName || !userId) return
    fetchAll()
    const iv = setInterval(fetchAll, 10_000)
    return () => clearInterval(iv)
  }, [strategyName, userId])

  // WS subscription to get instant updates for status & trades
  useFreqtradeWS({
    strategyName,
    enabled: true,
    eventTypes: ['status','entry','entry_fill','exit','exit_fill'],
    onEvent: (ev: FreqtradeEvent) => {
      if (ev.type === 'status' && ev.data?.status) {
        const st = ev.data.status.toLowerCase()
        setBotStatus(prev => ({
          ...prev,
          status:  st,
          running: st === 'running'
        }))
      }
      if (['entry','entry_fill','exit','exit_fill'].includes(ev.type)) {
        // quick refresh of trades count
        fetch(
          `/user/${strategyName}/api/v1/status`,
          {
            headers: {
              Authorization: 'Basic ' + btoa(`meghan:${userId}`)
            }
          }
        )
          .then(res => res.ok ? res.json() : [])
          .then(data => {
            const cnt = Array.isArray(data)
              ? data.length
              : Array.isArray(data?.open_trades)
                ? data.open_trades.length
                : 0
            setBotStatus(prev => ({ ...prev, openTradesCount: cnt }))
          })
          .catch(console.error)
      }
    }
  })

  return botStatus
}

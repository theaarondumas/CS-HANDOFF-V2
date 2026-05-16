'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type HandoffStatus =
  | 'open'
  | 'needs_followup'
  | 'claimed'
  | 'picking'
  | 'enroute'
  | 'delivered'
  | 'resolved'

type Handoff = {
  id: string
  title: string
  status: HandoffStatus
  owner_label: string | null
  created_at: string
}

const columns: {
  key: HandoffStatus
  label: string
  icon: string
  glow: string
}[] = [
  {
    key: 'open',
    label: 'RECEIVED',
    icon: '🟡',
    glow: 'border-yellow-400/60 bg-yellow-950/20 shadow-[0_0_22px_rgba(234,179,8,0.18)]',
  },
  {
    key: 'claimed',
    label: 'CLAIMED',
    icon: '🙋',
    glow: 'border-yellow-400/60 bg-yellow-950/20 shadow-[0_0_22px_rgba(234,179,8,0.18)]',
  },
  {
    key: 'picking',
    label: 'PICKING',
    icon: '📦',
    glow: 'border-yellow-400/60 bg-yellow-950/20 shadow-[0_0_22px_rgba(234,179,8,0.18)]',
  },
  {
    key: 'enroute',
    label: 'EN ROUTE',
    icon: '🚚',
    glow: 'border-green-500/60 bg-green-950/20 shadow-[0_0_22px_rgba(34,197,94,0.18)]',
  },
  {
    key: 'delivered',
    label: 'DELIVERED',
    icon: '✅',
    glow: 'border-green-500/60 bg-green-950/20 shadow-[0_0_22px_rgba(34,197,94,0.18)]',
  },
  {
    key: 'needs_followup',
    label: 'ACTION REQUIRED',
    icon: '🔴',
    glow: 'border-red-500/70 bg-red-950/30 shadow-[0_0_30px_rgba(239,68,68,0.25)]',
  },
]

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BoardPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [liveStatus, setLiveStatus] = useState('CONNECTING')
  const [lastUpdated, setLastUpdated] = useState('—')

  async function loadHandoffs() {
    const { data, error } = await supabase
      .from('handoffs')
      .select('id, title, status, owner_label, created_at')
      .neq('status', 'resolved')
      .order('created_at', { ascending: true })

    if (error) {
      setLiveStatus('LOAD ERROR')
      return
    }

    setHandoffs(data || [])
    setLastUpdated(
      new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    )
  }

  useEffect(() => {
    loadHandoffs()

    const channel = supabase
      .channel(`cs-board-live-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'handoffs',
        },
        () => {
          loadHandoffs()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'handoff_updates',
        },
        () => {
          loadHandoffs()
        }
      )
      .subscribe(status => {
        setLiveStatus(status)
      })

    const fastRefresh = window.setInterval(() => {
      loadHandoffs()
    }, 3000)

    return () => {
      window.clearInterval(fastRefresh)
      supabase.removeChannel(channel)
    }
  }, [])

  const activeCount = handoffs.length
  const actionCount = handoffs.filter(h => h.status === 'needs_followup').length
  const readyCount = handoffs.filter(
    h => h.status === 'enroute' || h.status === 'delivered'
  ).length
  const attentionCount = handoffs.filter(
    h => h.status === 'open' || h.status === 'claimed' || h.status === 'picking'
  ).length

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <section className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex items-start justify-between gap-6 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-green-400">
              CS HANDOFF
            </p>

            <h1 className="mt-2 text-5xl font-black tracking-tight">
              Live Board
            </h1>

            <p className="mt-2 text-zinc-400">
              Central Supply shift handoff status display
            </p>
          </div>

          <div className="text-right">
            <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
              {liveStatus === 'SUBSCRIBED' ? '🟢 LIVE' : `🟡 ${liveStatus}`}
            </div>

            <p className="mt-3 text-sm text-zinc-500">
              Updated {lastUpdated}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <p className="text-4xl font-black">{activeCount}</p>
            <p className="mt-1 text-sm uppercase tracking-widest text-zinc-300">
              Active Handoffs
            </p>
          </div>

          <div className="rounded-2xl border border-green-500/50 bg-green-950/20 p-5 shadow-[0_0_18px_rgba(34,197,94,0.15)]">
            <p className="text-4xl font-black">{readyCount}</p>
            <p className="mt-1 text-sm uppercase tracking-widest text-green-200">
              Ready / Moving
            </p>
          </div>

          <div className="rounded-2xl border border-yellow-400/60 bg-yellow-950/20 p-5 shadow-[0_0_18px_rgba(234,179,8,0.18)]">
            <p className="text-4xl font-black">{attentionCount}</p>
            <p className="mt-1 text-sm uppercase tracking-widest text-yellow-200">
              Needs Attention
            </p>
          </div>

          <div className="rounded-2xl border border-red-500/60 bg-red-950/30 p-5 shadow-[0_0_22px_rgba(239,68,68,0.22)]">
            <p className="text-4xl font-black">{actionCount}</p>
            <p className="mt-1 text-sm uppercase tracking-widest text-red-200">
              Action Required
            </p>
          </div>
        </section>

        <section className="grid grid-cols-6 gap-4">
          {columns.map(column => {
            const items = handoffs.filter(h => h.status === column.key)

            return (
              <div
                key={column.key}
                className={`min-h-[620px] rounded-3xl border ${column.glow} p-4`}
              >
                <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="text-2xl">{column.icon}</p>
                    <h2 className="text-lg font-black uppercase tracking-widest">
                      {column.label}
                    </h2>
                  </div>

                  <span className="rounded-full bg-black/40 px-3 py-1 text-sm">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.length === 0 && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center text-sm text-zinc-500">
                      Clear
                    </div>
                  )}

                  {items.map(item => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner"
                    >
                      <p className="text-lg font-bold leading-snug">
                        {item.title}
                      </p>

                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-400">
                        <span>{item.owner_label || 'Central Supply / Shift'}</span>
                        <span>{formatTime(item.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      </section>
    </main>
  )
}

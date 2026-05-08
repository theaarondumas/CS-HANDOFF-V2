'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type HandoffStatus =
  | 'open'
  | 'needs_followup'
  | 'claimed'
  | 'picking'
  | 'enroute'
  | 'delivered'
  | 'resolved'

type HandoffUpdate = {
  id: string
  handoff_id: string
  message: string
  source: string | null
  created_at: string
}

type Handoff = {
  id: string
  title: string
  description: string | null
  status: HandoffStatus
  owner_label: string | null
  created_at: string
  handoff_updates?: HandoffUpdate[]
}

function formatTime(value: string) {
  const date = new Date(value)
  const now = new Date()

  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date()
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (isToday) return `Today • ${time}`
  if (isYesterday) return `Yesterday • ${time}`

  return `${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} • ${time}`
}

function statusLabel(status: HandoffStatus) {
  if (status === 'open') return '🟡 Open'
  if (status === 'needs_followup') return '🔴 Action Required'
  if (status === 'claimed') return '🙋 Claimed'
  if (status === 'picking') return '📦 Picking'
  if (status === 'enroute') return '🚚 En Route'
  if (status === 'delivered') return '✅ Delivered'
  if (status === 'resolved') return '😁 Resolved'
  return status
}

export default function HomePage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [liveStatus, setLiveStatus] = useState('CONNECTING')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [updateText, setUpdateText] = useState<Record<string, string>>({})

  const boardSignatureRef = useRef('')

  function showNotice(message: string) {
    setNotice(message)

    window.setTimeout(() => {
      setNotice('')
    }, 3500)
  }

  function getBoardSignature(items: Handoff[]) {
    return items
      .map(h => {
        const updateIds = (h.handoff_updates || []).map(u => u.id).join(',')
        return `${h.id}:${h.status}:${updateIds}`
      })
      .join('|')
  }

  async function loadHandoffs(showSmartToast = false) {
    const { data, error } = await supabase
      .from('handoffs')
      .select(`*, handoff_updates (*)`)
      .order('created_at', { ascending: false })

    if (error) {
      alert(`Load handoffs failed: ${error.message}`)
      setLoading(false)
      return
    }

    const normalized = (data || []).map((h: Handoff) => ({
      ...h,
      handoff_updates: [...(h.handoff_updates || [])].sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      ),
    }))

    const newSignature = getBoardSignature(normalized)

    if (
      showSmartToast &&
      boardSignatureRef.current &&
      newSignature !== boardSignatureRef.current
    ) {
      showNotice('📡 Board updated')
    }

    boardSignatureRef.current = newSignature

    setHandoffs(normalized)
    setLoading(false)
  }

  useEffect(() => {
    loadHandoffs(false)

    const channel = supabase
      .channel(`cs-handoff-live-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'handoffs',
        },
        () => {
          loadHandoffs(true)
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
          loadHandoffs(true)
        }
      )
      .subscribe(status => {
        setLiveStatus(status)
      })

    const fallbackRefresh = window.setInterval(() => {
      loadHandoffs(true)
    }, 10000)

    return () => {
      window.clearInterval(fallbackRefresh)
      supabase.removeChannel(channel)
    }
  }, [])

  async function createHandoff() {
    if (!title.trim()) return

    setCreating(true)

    const { data, error } = await supabase
      .from('handoffs')
      .insert({
        title: title.trim(),
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      alert(`Create handoff failed: ${error.message}`)
      setCreating(false)
      return
    }

    const { error: timelineError } = await supabase
      .from('handoff_updates')
      .insert({
        handoff_id: data.id,
        message: 'Handoff created',
        source: 'system',
      })

    if (timelineError) {
      alert(`Timeline insert failed: ${timelineError.message}`)
      setCreating(false)
      return
    }

    setTitle('')
    setCreating(false)
    showNotice('🟢 Handoff created')
    loadHandoffs(false)
  }

  async function updateStatus(id: string, status: HandoffStatus) {
    const { error } = await supabase
      .from('handoffs')
      .update({ status })
      .eq('id', id)

    if (error) {
      alert(`Status update failed: ${error.message}`)
      return
    }

    const { error: timelineError } = await supabase
      .from('handoff_updates')
      .insert({
        handoff_id: id,
        message: `Status changed to ${statusLabel(status)}`,
        source: 'system',
      })

    if (timelineError) {
      alert(`Timeline update failed: ${timelineError.message}`)
      return
    }

    showNotice(`🔄 ${statusLabel(status)}`)
    loadHandoffs(false)
  }

  async function addUpdate(id: string) {
    const message = updateText[id]?.trim()
    if (!message) return

    const { error } = await supabase.from('handoff_updates').insert({
      handoff_id: id,
      message,
      source: 'app',
    })

    if (error) {
      alert(`Add update failed: ${error.message}`)
      return
    }

    setUpdateText(prev => ({ ...prev, [id]: '' }))
    showNotice('💬 Update added')
    loadHandoffs(false)
  }

  const openHandoffs = handoffs.filter(h => h.status !== 'resolved')
  const resolvedHandoffs = handoffs.filter(h => h.status === 'resolved')

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-24">
      {notice && (
        <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
          <div className="rounded-xl border border-green-500/40 bg-green-950 px-4 py-3 text-sm text-green-200 shadow-lg">
            {notice}
          </div>
        </div>
      )}

      <section className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="text-xs text-green-400 tracking-widest">
            FEED_BUILD: PHASE_1_RE_GLOW_TILES_PWA_SAFE
          </p>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold mt-2">CS HANDOFF</h1>
              <p className="text-zinc-400 mt-1">
                Central Supply live shift handoff board
              </p>
            </div>

            <div className="text-xs rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
              {liveStatus === 'SUBSCRIBED' ? '🟢 LIVE' : `🟡 ${liveStatus}`}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-green-500/50 bg-green-950/20 p-3 text-center shadow-[0_0_18px_rgba(34,197,94,0.15)]">
            <p className="text-lg font-bold">
              {
                handoffs.filter(
                  h =>
                    h.status === 'enroute' ||
                    h.status === 'delivered' ||
                    h.status === 'resolved'
                ).length
              }
            </p>
            <p className="text-[10px] text-green-200">READY</p>
          </div>

          <div className="rounded-xl border border-yellow-400/60 bg-yellow-950/20 p-3 text-center shadow-[0_0_18px_rgba(234,179,8,0.18)]">
            <p className="text-lg font-bold">
              {
                handoffs.filter(
                  h =>
                    h.status === 'open' ||
                    h.status === 'claimed' ||
                    h.status === 'picking'
                ).length
              }
            </p>
            <p className="text-[10px] text-yellow-200">NEEDS ATTENTION</p>
          </div>

          <div className="rounded-xl border border-red-500/70 bg-red-950/30 p-3 text-center shadow-[0_0_20px_rgba(239,68,68,0.22)]">
            <p className="text-lg font-bold">
              {handoffs.filter(h => h.status === 'needs_followup').length}
            </p>
            <p className="text-[10px] text-red-200">ACTION REQUIRED</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-lg">Create Handoff</h2>

          <input
            className="w-full bg-black border border-zinc-700 rounded-xl p-3 outline-none focus:border-white"
            placeholder="Broken tag, missing tote, backorder, follow-up..."
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <button
            onClick={createHandoff}
            disabled={creating}
            className="w-full rounded-xl bg-white text-black font-bold p-3 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Handoff'}
          </button>
        </div>

        {loading && (
          <div className="text-zinc-400 text-center py-10">
            Loading handoffs...
          </div>
        )}

        {!loading && openHandoffs.length === 0 && (
          <div className="border border-zinc-800 rounded-2xl p-6 text-center text-zinc-400">
            No open handoffs.
          </div>
        )}

        {!loading && openHandoffs.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Open Handoffs</h2>

            {openHandoffs.map(handoff => (
              <HandoffCard
                key={handoff.id}
                handoff={handoff}
                updateText={updateText[handoff.id] || ''}
                setUpdateText={value =>
                  setUpdateText(prev => ({
                    ...prev,
                    [handoff.id]: value,
                  }))
                }
                addUpdate={() => addUpdate(handoff.id)}
                updateStatus={status => updateStatus(handoff.id, status)}
              />
            ))}
          </section>
        )}

        {!loading && resolvedHandoffs.length > 0 && (
          <section className="space-y-4 pt-4">
            <h2 className="text-xl font-bold text-zinc-400">Resolved</h2>

            {resolvedHandoffs.map(handoff => (
              <HandoffCard
                key={handoff.id}
                handoff={handoff}
                resolved
                updateText={updateText[handoff.id] || ''}
                setUpdateText={value =>
                  setUpdateText(prev => ({
                    ...prev,
                    [handoff.id]: value,
                  }))
                }
                addUpdate={() => addUpdate(handoff.id)}
                updateStatus={status => updateStatus(handoff.id, status)}
              />
            ))}
          </section>
        )}
      </section>
    </main>
  )
}

function HandoffCard({
  handoff,
  resolved = false,
  updateText,
  setUpdateText,
  addUpdate,
  updateStatus,
}: {
  handoff: Handoff
  resolved?: boolean
  updateText: string
  setUpdateText: (value: string) => void
  addUpdate: () => void
  updateStatus: (status: HandoffStatus) => void
}) {
  const tileGlow =
    handoff.status === 'needs_followup'
      ? 'border-red-500/80 bg-red-950/30 shadow-[0_0_30px_rgba(239,68,68,0.28)]'
      : handoff.status === 'open' ||
        handoff.status === 'claimed' ||
        handoff.status === 'picking'
      ? 'border-yellow-400/70 bg-yellow-950/20 shadow-[0_0_26px_rgba(234,179,8,0.22)]'
      : 'border-green-500/60 bg-green-950/20 shadow-[0_0_22px_rgba(34,197,94,0.18)]'

  return (
    <div
      className={`rounded-2xl border ${tileGlow} p-4 space-y-4 transition-all duration-300 ${
        resolved ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{handoff.title}</h3>

          <p className="text-xs text-zinc-400 mt-1">
            {handoff.owner_label || 'Central Supply / Shift'}
          </p>

          <p className="text-xs text-zinc-500">
            {formatTime(handoff.created_at)}
          </p>
        </div>

        <span className="text-xs rounded-full border border-zinc-700 bg-black/30 px-3 py-1 h-fit whitespace-nowrap">
          {statusLabel(handoff.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => updateStatus('open')}
          className="rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 p-2 text-sm"
        >
          🟡 Open
        </button>

        <button
          onClick={() => updateStatus('needs_followup')}
          className="rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 p-2 text-sm"
        >
          🔴 Action Required
        </button>

        <button
          onClick={() => updateStatus('claimed')}
          className="rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 p-2 text-sm"
        >
          🙋 Claimed
        </button>

        <button
          onClick={() => updateStatus('picking')}
          className="rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 p-2 text-sm"
        >
          📦 Picking
        </button>

        <button
          onClick={() => updateStatus('enroute')}
          className="rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 p-2 text-sm"
        >
          🚚 En Route
        </button>

        <button
          onClick={() => updateStatus('delivered')}
          className="rounded-lg bg-black/35 hover:bg-black/50 border border-white/10 p-2 text-sm"
        >
          ✅ Delivered
        </button>

        <button
          onClick={() => updateStatus('resolved')}
          className="col-span-2 rounded-lg bg-white text-black font-bold p-2 text-sm"
        >
          😁 Resolve
        </button>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-3">
        <p className="text-sm font-semibold">Timeline</p>

        {(handoff.handoff_updates || []).map(update => (
          <div key={update.id} className="text-sm text-zinc-300">
            <p>{update.message}</p>
            <p className="text-xs text-zinc-500">
              {formatTime(update.created_at)} • {update.source || 'app'}
            </p>
          </div>
        ))}
      </div>

      {!resolved && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-black/50 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-white"
            placeholder="Add update..."
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
          />

          <button
            onClick={addUpdate}
            className="rounded-xl bg-white text-black font-bold px-4"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}

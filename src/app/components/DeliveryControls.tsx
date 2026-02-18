"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type CSStatus =
  | "open"
  | "claimed"
  | "picking"
  | "enroute"
  | "delivered"
  | "needs_followup"
  | "resolved"

type DeliveryControlsProps = {
  handoffId: string
  status: string | null
  displayName?: string | null
}

const NEXT_ACTION: Record<CSStatus, { label: string; next: CSStatus } | null> = {
  open: { label: "CLAIM", next: "claimed" },
  claimed: { label: "START PICKING", next: "picking" },
  picking: { label: "EN ROUTE", next: "enroute" },
  enroute: { label: "MARK DELIVERED", next: "delivered" },
  delivered: { label: "CLOSE REQUEST", next: "resolved" },
  needs_followup: { label: "CLOSE REQUEST", next: "resolved" },
  resolved: null,
}

function ProgressEmojiBar({ status }: { status: CSStatus }) {
  // Only show once claimed or beyond
  if (status === "open" || status === "needs_followup") return null

  const order: CSStatus[] = ["claimed", "picking", "enroute", "delivered", "resolved"]
  const idx = order.indexOf(status)
  const filled = Math.max(0, idx)

  // 5 slots
  const slots = ["□", "□", "□", "□", "□"]
  for (let i = 0; i < filled; i++) slots[i] = "■"

  // Emoji rules
  const emoji = status === "delivered" ? "🚚" : status === "resolved" ? "😁" : "📦"

  // Place emoji at the "current" slot, clamped
  const emojiPos = Math.min(filled, 4)
  slots[emojiPos] = emoji

  return (
    <div
      style={{
        marginTop: 6,
        display: "inline-block",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 16,
        letterSpacing: 1,
        opacity: 0.95,
        userSelect: "none",
      }}
      aria-label={`Delivery progress: ${status}`}
      title={`Status: ${status}`}
    >
      [{slots.join("")}]
    </div>
  )
}

export default function DeliveryControls(props: DeliveryControlsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const status = (props.status as CSStatus) ?? "open"
  const action = NEXT_ACTION[status]

  async function updateStatus(nextStatus: CSStatus) {
    setLoading(true)
    try {
      const res = await fetch("/api/handoff/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoffId: props.handoffId,
          nextStatus,
          displayName: props.displayName ?? "Staff",
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || "Failed to update status")
      }

      router.refresh()
    } catch (e: any) {
      alert(e?.message || "Error updating status")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <ProgressEmojiBar status={status} />

      {action ? (
        <button
          disabled={loading}
          onClick={() => updateStatus(action.next)}
          style={{
            marginTop: 10,
            padding: "12px 14px",
            width: "100%",
            borderRadius: 12,
            fontWeight: 900,
            letterSpacing: 0.4,
            opacity: loading ? 0.65 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "UPDATING..." : action.label}
        </button>
      ) : null}
    </div>
  )
}

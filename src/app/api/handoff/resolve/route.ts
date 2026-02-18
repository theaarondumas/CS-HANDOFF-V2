import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { handoffId, nextStatus, displayName } = body

    if (!handoffId || !nextStatus) {
      return NextResponse.json(
        { error: "Missing handoffId or nextStatus" },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    // map timestamps per status
    const timestampMap: Record<string, string> = {
      claimed: "claimed_at",
      picking: "picking_at",
      enroute: "enroute_at",
      delivered: "delivered_at",
      resolved: "resolved_at",
    }

    const updatePayload: any = {
      status: nextStatus,
      last_update_at: now,
      last_update_source: "app",
      last_update_preview: `Status → ${nextStatus.toUpperCase()}`,
    }

    if (nextStatus === "claimed") {
      updatePayload.owner_display_name_snapshot = displayName ?? "Staff"
    }

    const timestampColumn = timestampMap[nextStatus]
    if (timestampColumn) {
      updatePayload[timestampColumn] = now
    }

    // 1️⃣ update handoff row
    const { error: updateError } = await supabase
      .from("handoffs")
      .update(updatePayload)
      .eq("id", handoffId)

    if (updateError) throw updateError

    // human readable timeline message
    const human: Record<string, string> = {
      claimed: "📦 Claimed",
      picking: "📦 Picking",
      enroute: "📦 En route",
      delivered: "🚚 Delivered",
      resolved: "😁 Resolved",
    }

    const msg =
      human[nextStatus] ?? `Status → ${String(nextStatus).toUpperCase()}`

    // 2️⃣ append audit row (FIXED message requirement)
    const { error: insertError } = await supabase
      .from("handoff_updates")
      .insert({
        handoff_id: handoffId,
        source: "app",
        message: msg,
        type: "status_change",
        to_status: nextStatus,
        new_status: nextStatus,
        author_display_name_snapshot: displayName ?? "Staff",
      })

    if (insertError) throw insertError

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

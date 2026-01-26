import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/sms/notify
 * Triggered by the app (server-side) when a high-priority handoff is created.
 * For now: append-only "system" update to audit that an alert was triggered.
 * Later: add Twilio send here.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.SMS_WEBHOOK_SECRET;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceKey);

export async function POST(req: NextRequest) {
  try {
    // Shared-secret protection
    if (webhookSecret) {
      const got = req.headers.get("x-webhook-secret");
      if (!got || got !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { handoff_id, summary, priority, location_code } = await req.json();

    if (!handoff_id || !priority) {
      return NextResponse.json(
        { error: "handoff_id and priority are required" },
        { status: 400 }
      );
    }

    // Only alert for HIGH priority
    const p = String(priority).toLowerCase();
    if (p !== "high") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Append-only audit update (no PHI)
    const msg = `SYSTEM: SMS ALERT TRIGGERED (high)${
      location_code ? ` [${location_code}]` : ""
    }: ${String(summary || "").slice(0, 120)}`;

    const { error } = await supabase.from("handoff_updates").insert({
      handoff_id,
      author_user_id: null,
      author_display_name_snapshot: "system",
      source: "system",
      message: msg,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Later: add Twilio send here (outbound)
    return NextResponse.json({ ok: true, alerted: true });
  } catch (e: any) {
    console.error("SMS NOTIFY ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

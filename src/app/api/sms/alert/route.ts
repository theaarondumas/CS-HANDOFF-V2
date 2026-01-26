import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/sms/alert
 * - Server-only insert into handoff_updates (append-only)
 * - No PHI
 * - Protected by SMS_WEBHOOK_SECRET
 * - Accepts JSON (now) and can be extended for Twilio form posts later
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.SMS_WEBHOOK_SECRET;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceKey);

export async function POST(req: NextRequest) {
  try {
    // Simple shared-secret protection (recommended)
    if (webhookSecret) {
      const got = req.headers.get("x-webhook-secret");
      if (!got || got !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const contentType = req.headers.get("content-type") || "";
    let payload: any = {};

    // JSON payload (our default)
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      // Fallback: try parse form-encoded (useful later for Twilio)
      const text = await req.text();
      const params = new URLSearchParams(text);
      payload = Object.fromEntries(params.entries());
    }

    /**
     * Expected payload (JSON recommended):
     * {
     *   handoff_id: "uuid",
     *   from: "+15551234567",
     *   message: "Still pending — need follow-up"
     * }
     */
    const handoff_id = payload.handoff_id || payload.handoffId;
    const from = payload.from || payload.From || null;
    const message = payload.message || payload.Body;

    if (!handoff_id || !message) {
      return NextResponse.json(
        { error: "handoff_id and message are required" },
        { status: 400 }
      );
    }

    // Append-only insert into handoff_updates
    const { error } = await supabase.from("handoff_updates").insert({
      handoff_id,
      author_user_id: null,
      author_display_name_snapshot: from ? `sms:${from}` : "sms",
      source: "sms",
      message: String(message).trim(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("SMS ALERT ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

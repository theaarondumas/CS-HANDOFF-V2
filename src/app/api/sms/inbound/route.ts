import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceKey);

// Expect token like H:ABC123 somewhere in the reply
function extractToken(body: string): string | null {
  const m = body.match(/\bH:([A-Za-z0-9]{4,12})\b/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let message = "";
    let from: string | null = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const raw = await req.text();
      const params = new URLSearchParams(raw);
      message = params.get("Body") || "";
      from = params.get("From") || null;
    } else {
      const j = await req.json();
      message = String(j.message || "");
      from = j.from ? String(j.from) : null;
    }

    message = message.trim();
    const token = extractToken(message);

    if (!token) {
      return NextResponse.json(
        { error: "Missing token. Include e.g. H:ABC123 in reply." },
        { status: 400 }
      );
    }

    const { data: mapRow, error: mapErr } = await supabase
      .from("handoff_tokens")
      .select("handoff_id")
      .eq("token", token)
      .single();

    if (mapErr || !mapRow?.handoff_id) {
      return NextResponse.json({ error: "Unknown token." }, { status: 404 });
    }

    const { error } = await supabase.from("handoff_updates").insert({
      handoff_id: mapRow.handoff_id,
      author_user_id: null,
      author_display_name_snapshot: from ? `sms:${from}` : "sms",
      source: "sms",
      message,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

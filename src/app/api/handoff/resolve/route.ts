import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabaseService = createClient(supabaseUrl, serviceKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

    const accessToken = m[1];
    const { data: userData, error: userErr } =
      await supabaseAnon.auth.getUser(accessToken);

    if (userErr || !userData?.user)
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const { handoff_id } = await req.json();
    if (!handoff_id)
      return NextResponse.json({ error: "handoff_id required" }, { status: 400 });

    // close handoff
    const { error: updErr } = await supabaseService
      .from("handoffs")
      .update({ status: "closed" })
      .eq("id", handoff_id);

    if (updErr) throw updErr;

    // audit entry
    const msg = `SYSTEM: RESOLVED by ${userData.user.email ?? userData.user.id}`;

    const { error: insErr } = await supabaseService
      .from("handoff_updates")
      .insert({
        handoff_id,
        author_user_id: null,
        author_display_name_snapshot: "system",
        source: "system",
        message: msg,
      });

    if (insErr) throw insErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("RESOLVE ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

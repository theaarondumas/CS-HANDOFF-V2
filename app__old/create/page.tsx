"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

/* =========================
   SUPABASE SAFE INIT
========================= */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

type UserMini = { id: string; email?: string | null };

export default function CreateHandoffPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserMini | null>(null);

  // Form fields (match your DB columns)
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [locationCode, setLocationCode] = useState("CS");
  const [displayNameSnapshot, setDisplayNameSnapshot] = useState("AD / CS");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      !!supabase &&
      !!user?.id &&
      summary.trim().length >= 5 &&
      category.trim().length > 0 &&
      priority.trim().length > 0 &&
      locationCode.trim().length > 0
    );
  }, [user?.id, summary, category, priority, locationCode]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setErrorMsg(null);

      if (!supabase) {
        setErrorMsg("Supabase env vars missing. Check NEXT_PUBLIC_SUPABASE_URL / ANON_KEY.");
        setReady(true);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUser(null);
        setReady(true);
        return;
      }

      setUser({ id: data.user.id, email: data.user.email });
      setReady(true);
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  async function onCreate() {
    setOkMsg(null);
    setErrorMsg(null);

    if (!supabase) {
      setErrorMsg("Supabase not initialized.");
      return;
    }
    if (!user?.id) {
      setErrorMsg("Not signed in. Open the app login first.");
      return;
    }
    if (!canSubmit) {
      setErrorMsg("Fill out the required fields (summary must be at least 5 chars).");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        summary: summary.trim(),
        category: category.trim(),
        priority: priority.trim(),
        status: "open",
        location_code: locationCode.trim(),
        created_by: user.id,
        created_by_display_name_snapshot: displayNameSnapshot.trim() || null,
      };

      const { data, error } = await supabase
        .from("handoffs")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      setOkMsg("✅ Handoff created.");
      setSummary("");

      // Go to detail page if you have it; otherwise go back to feed
      if (data?.id) {
        router.push(`/handoff/${data.id}`);
      } else {
        router.push(`/app`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to create handoff.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Create Handoff</h1>

      {!ready && <p>Loading…</p>}

      {ready && !supabase && (
        <p style={{ color: "tomato" }}>
          Supabase not configured. Check env vars.
        </p>
      )}

      {ready && supabase && !user?.id && (
        <div style={{ border: "1px solid #333", padding: 12, borderRadius: 12 }}>
          <p style={{ margin: 0 }}>
            You’re not signed in. Open your main app page and use magic link login.
          </p>
        </div>
      )}

      {ready && supabase && user?.id && (
        <>
          <div style={{ opacity: 0.8, marginBottom: 12 }}>
            Signed in as: <strong>{user.email ?? user.id}</strong>
          </div>

          {errorMsg && (
            <div
              style={{
                border: "1px solid tomato",
                padding: 12,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <strong style={{ color: "tomato" }}>Error:</strong> {errorMsg}
            </div>
          )}

          {okMsg && (
            <div
              style={{
                border: "1px solid #2ecc71",
                padding: 12,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              {okMsg}
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Summary *</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What happened / what needs follow-up?"
                rows={4}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
              />
            </label>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Category *</span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="general / receiving / OR / etc"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Priority *</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Location Code *</span>
                <input
                  value={locationCode}
                  onChange={(e) => setLocationCode(e.target.value)}
                  placeholder="CS / OR / ICU"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Created By (snapshot)</span>
                <input
                  value={displayNameSnapshot}
                  onChange={(e) => setDisplayNameSnapshot(e.target.value)}
                  placeholder="AD / CS"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
                />
              </label>
            </div>

            <button
              onClick={onCreate}
              disabled={!canSubmit || submitting}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid #333",
                fontWeight: 800,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: !canSubmit || submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Creating…" : "Create Handoff"}
            </button>

            <button
              onClick={() => router.push("/app")}
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #333",
                opacity: 0.85,
              }}
            >
              Back to Feed
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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

function titleCaseEnum(s: string) {
  return (s || "")
    .trim()
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function CreateHandoffPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserMini | null>(null);

  // Enum-driven options from DB (single source of truth)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>(["low", "medium", "high"]); // fallback

  const [enumsLoaded, setEnumsLoaded] = useState(false);

  // Form fields (match your DB columns)
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<string>(""); // set once enums load
  const [priority, setPriority] = useState<string>(""); // set once enums load
  const [locationCode, setLocationCode] = useState("CS");
  const [displayNameSnapshot, setDisplayNameSnapshot] = useState("AD / CS");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      !!supabase &&
      !!user?.id &&
      enumsLoaded &&
      summary.trim().length >= 5 &&
      !!category &&
      !!priority &&
      locationCode.trim().length > 0
    );
  }, [user?.id, enumsLoaded, summary, category, priority, locationCode]);

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

      // Load enums AFTER auth is confirmed
      try {
        // Categories (required)
        const cat = await supabase.rpc("get_cs_category_enum");
        if (cat.error) throw cat.error;

        const cats = (cat.data ?? []).map((x: any) => String(x));
        setCategoryOptions(cats);

        // Default category: prefer general if present
        const defaultCategory = cats.includes("general") ? "general" : cats[0] ?? "";
        setCategory(defaultCategory);

        // Priority (optional). If cs_priority enum/RPC exists it will work.
        const pri = await supabase.rpc("get_cs_priority_enum");
        if (!pri.error) {
          const pris = (pri.data ?? []).map((x: any) => String(x));
          if (pris.length > 0) {
            setPriorityOptions(pris);
            const defaultPriority = pris.includes("medium") ? "medium" : pris[0];
            setPriority(defaultPriority);
          } else {
            setPriority("medium");
          }
        } else {
          // fallback list (already set)
          setPriority("medium");
        }

        setEnumsLoaded(true);
      } catch (e: any) {
        // If enums can’t load, block submit and show a clear error
        setEnumsLoaded(false);
        setErrorMsg(
          e?.message ??
            "Failed to load enums. Ensure RPC get_cs_category_enum exists and is granted."
        );
      }
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
      setErrorMsg("Fill out the required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        summary: summary.trim(),
        category, // ✅ enum-driven (guaranteed valid)
        priority: priority.trim(), // ✅ enum-driven (or fallback)
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

      setTimeout(() => {
        router.push(`/handoff/${data.id}`);
      }, 600);
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
        <p style={{ color: "tomato" }}>Supabase not configured. Check env vars.</p>
      )}

      {ready && supabase && !user?.id && (
        <div style={{ border: "1px solid #333", padding: 12, borderRadius: 12 }}>
          <p style={{ margin: 0 }}>
            You’re not signed in. Open your main app page and use magic link login.
          </p>
          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 12,
              border: "1px solid #333",
              opacity: 0.9,
              cursor: "pointer",
            }}
          >
            Back to Feed
          </button>
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
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={!enumsLoaded || categoryOptions.length === 0}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {titleCaseEnum(c)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Priority *</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={!enumsLoaded || priorityOptions.length === 0}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333" }}
                >
                  {priorityOptions.map((p) => (
                    <option key={p} value={p}>
                      {titleCaseEnum(p)}
                    </option>
                  ))}
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
              onClick={() => router.push("/")}
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #333",
                opacity: 0.85,
                cursor: "pointer",
              }}
            >
              Back to Feed
            </button>

            <div style={{ opacity: 0.6, fontSize: 12 }}>
              Dropdowns are enum-driven (DB source of truth). If values change in DB, UI updates automatically.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

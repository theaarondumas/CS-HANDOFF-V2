"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Handoff = {
  id: string;
  created_at: string;
  summary: string;
  category: string;
  priority: string;
  location_code: string | null;
  status: string | null;
  last_update_at?: string | null;
};

type UpdateRow = {
  id: string;
  created_at: string;
  handoff_id: string;
  author_user_id: string | null;
  author_display_name_snapshot: string | null;
  source: "app" | "sms" | "system";
  message: string;
};

function glowStyleForPriority(priority?: string) {
  const p = (priority || "").toLowerCase();
  if (p === "high") {
    return {
      boxShadow:
        "0 0 18px rgba(255, 80, 80, 0.25), 0 0 42px rgba(255, 80, 80, 0.12)",
      border: "1px solid rgba(255, 80, 80, 0.28)",
    };
  }
  if (p === "medium") {
    return {
      boxShadow:
        "0 0 18px rgba(255, 190, 60, 0.22), 0 0 42px rgba(255, 190, 60, 0.10)",
      border: "1px solid rgba(255, 190, 60, 0.26)",
    };
  }
  return {
    boxShadow:
      "0 0 18px rgba(80, 255, 160, 0.18), 0 0 42px rgba(80, 255, 160, 0.08)",
    border: "1px solid rgba(80, 255, 160, 0.22)",
  };
}

/**
 * ✅ Canonical CS_STATUS enum values (confirmed):
 * open | needs_followup | resolved
 */
function isResolvedStatus(status?: string | null) {
  const s = (status || "open").trim().toLowerCase();
  return s === "resolved";
}

export default function HandoffDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);

  const [newUpdate, setNewUpdate] = useState("");
  const [savingUpdate, setSavingUpdate] = useState(false);

  const [resolving, setResolving] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canAddUpdate = useMemo(
    () => newUpdate.trim().length >= 2 && !savingUpdate,
    [newUpdate, savingUpdate]
  );

  async function load() {
    if (!id) return;

    setLoading(true);
    setErrorMsg(null);

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user?.id) {
      setErrorMsg("Not signed in.");
      setLoading(false);
      return;
    }

    const { data: h, error: hErr } = await supabase
      .from("handoffs")
      .select(
        "id, created_at, summary, category, priority, location_code, status, last_update_at"
      )
      .eq("id", id)
      .single();

    if (hErr) {
      setErrorMsg(hErr.message);
      setLoading(false);
      return;
    }

    const { data: u, error: uErr } = await supabase
      .from("handoff_updates")
      .select(
        "id, created_at, handoff_id, author_user_id, author_display_name_snapshot, source, message"
      )
      .eq("handoff_id", id)
      .order("created_at", { ascending: false });

    if (uErr) {
      setErrorMsg(uErr.message);
      setLoading(false);
      return;
    }

    setHandoff(h as any);
    setUpdates((u ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addUpdate() {
    setToast(null);
    setErrorMsg(null);

    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user?.id) {
      setErrorMsg("Not signed in.");
      return;
    }
    if (!id) return;

    setSavingUpdate(true);
    try {
      const payload = {
        handoff_id: id,
        author_user_id: user.id,
        author_display_name_snapshot: user.email ?? null,
        source: "app" as const,
        message: newUpdate.trim(),
      };

      const { error } = await supabase.from("handoff_updates").insert(payload);
      if (error) throw error;

      setNewUpdate("");
      setToast("✅ Update added.");
      await load();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to add update.");
    } finally {
      setSavingUpdate(false);
    }
  }

  /**
   * ✅ FIXED FOR REAL:
   * - Writes enum value "resolved" (NOT "closed")
   * - Uses `.select()` to detect RLS “0 rows updated” silent-fail
   * - Updates local state immediately
   */
  async function markResolved() {
    setToast(null);
    setErrorMsg(null);

    if (!handoff?.id) return;

    setResolving(true);
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("handoffs")
        .update({
          status: "resolved",
          last_update_at: now,
        })
        .eq("id", handoff.id)
        .select("id, status, last_update_at"); // ✅ forces returned rows

      if (error) throw error;

      // ✅ If RLS blocks it, we get [] with no error. Catch it.
      if (!data || data.length === 0) {
        throw new Error(
          "0 rows updated. RLS is blocking UPDATE on handoffs. Fix Supabase policy for UPDATE."
        );
      }

      const updated = data[0];

      setHandoff((prev: any) =>
        prev
          ? {
              ...prev,
              status: updated.status,
              last_update_at: updated.last_update_at,
            }
          : prev
      );

      setToast("✅ Marked resolved.");
      await load();
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to mark resolved.");
    } finally {
      setResolving(false);
    }
  }

  async function sendSms() {
    setToast(null);
    setErrorMsg(null);
    if (!handoff) return;

    setSmsSending(true);
    try {
      const res = await fetch("/api/sms/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoff_id: handoff.id,
          summary: handoff.summary,
          priority: handoff.priority,
          location_code: handoff.location_code,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "SMS failed.");

      setToast("✅ SMS sent.");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "SMS failed.");
    } finally {
      setSmsSending(false);
    }
  }

  const resolvedNow = isResolvedStatus(handoff?.status);

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26 }}>Handoff Detail</h1>
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
            opacity: 0.85,
          }}
        >
          ← Back to Feed
        </button>
      </div>

      {loading && <p style={{ opacity: 0.75, marginTop: 14 }}>Loading…</p>}

      {errorMsg && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid tomato",
          }}
        >
          <b style={{ color: "tomato" }}>Error:</b> {errorMsg}
        </div>
      )}

      {toast && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(80,255,160,0.4)",
          }}
        >
          {toast}
        </div>
      )}

      {!loading && handoff && (
        <>
          <div
            style={{
              marginTop: 14,
              borderRadius: 14,
              padding: 14,
              ...glowStyleForPriority(handoff.priority),
              opacity: resolvedNow ? 0.7 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {handoff.summary}
              </div>
              <div
                style={{ opacity: 0.7, fontSize: 12, whiteSpace: "nowrap" }}
              >
                {new Date(
                  handoff.last_update_at ?? handoff.created_at
                ).toLocaleString()}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 8,
                opacity: 0.85,
                fontSize: 12,
              }}
            >
              <span>
                Category: <b>{handoff.category}</b>
              </span>
              <span>
                Priority: <b>{handoff.priority}</b>
              </span>
              {handoff.location_code && (
                <span>
                  Location: <b>{handoff.location_code}</b>
                </span>
              )}
              <span>
                Status: <b>{handoff.status || "open"}</b>
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={markResolved}
                disabled={resolving || resolvedNow}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "transparent",
                  color: "#fff",
                  cursor: resolving ? "not-allowed" : "pointer",
                  opacity: resolving || resolvedNow ? 0.5 : 0.9,
                  fontWeight: 800,
                }}
              >
                {resolvedNow
                  ? "Resolved ✅"
                  : resolving
                  ? "Resolving…"
                  : "Mark Resolved"}
              </button>

              <button
                onClick={sendSms}
                disabled={smsSending}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "transparent",
                  color: "#fff",
                  cursor: smsSending ? "not-allowed" : "pointer",
                  opacity: smsSending ? 0.5 : 0.85,
                }}
              >
                {smsSending ? "Sending SMS…" : "Send SMS Alert"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, opacity: 0.9 }}>
              Add Update
            </h2>

            <textarea
              value={newUpdate}
              onChange={(e) => setNewUpdate(e.target.value)}
              rows={3}
              placeholder="Append an update (no overwrites)…"
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #333",
              }}
            />

            <button
              onClick={addUpdate}
              disabled={!canAddUpdate}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #333",
                background: "transparent",
                color: "#fff",
                cursor: !canAddUpdate ? "not-allowed" : "pointer",
                opacity: !canAddUpdate ? 0.5 : 0.9,
                fontWeight: 800,
              }}
            >
              {savingUpdate ? "Saving…" : "Add Update"}
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            <h2 style={{ margin: "0 0 10px 0", fontSize: 16, opacity: 0.9 }}>
              Updates
            </h2>

            {updates.length === 0 ? (
              <div
                style={{
                  border: "1px solid #333",
                  borderRadius: 12,
                  padding: 12,
                  opacity: 0.8,
                }}
              >
                No updates yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {updates.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      border: "1px solid #333",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        opacity: 0.75,
                        fontSize: 12,
                      }}
                    >
                      <span>
                        {u.source.toUpperCase()}
                        {u.author_display_name_snapshot
                          ? ` • ${u.author_display_name_snapshot}`
                          : ""}
                      </span>
                      <span>{new Date(u.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 14 }}>{u.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

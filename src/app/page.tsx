"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type HandoffRow = {
  id: string;
  created_at: string;
  summary: string;
  category: string;
  priority: string;
  location_code: string | null;
  status: string | null;
  last_update_at?: string | null;
};

/**
 * ✅ Canonical cs_status enum values (confirmed):
 * open | needs_followup | resolved
 *
 * Single source of truth: what counts as RESOLVED in UI
 */
function isResolvedStatus(status?: string | null) {
  const s = (status || "open").trim().toLowerCase();
  return s === "resolved";
}

/** Soft glow by priority (low/medium/high) — OPEN only */
function glowStyleForPriority(priority?: string) {
  const p = (priority || "").toLowerCase();
  if (p === "high")
    return {
      boxShadow:
        "0 0 18px rgba(255, 80, 80, 0.25), 0 0 42px rgba(255, 80, 80, 0.12)",
      border: "1px solid rgba(255, 80, 80, 0.28)",
    };
  if (p === "medium")
    return {
      boxShadow:
        "0 0 18px rgba(255, 190, 60, 0.22), 0 0 42px rgba(255, 190, 60, 0.10)",
      border: "1px solid rgba(255, 190, 60, 0.26)",
    };
  return {
    boxShadow:
      "0 0 18px rgba(80, 255, 160, 0.18), 0 0 42px rgba(80, 255, 160, 0.08)",
    border: "1px solid rgba(80, 255, 160, 0.22)",
  };
}

/** RESOLVED style — hard “dead” look */
function resolvedCardStyle(): React.CSSProperties {
  return {
    opacity: 0.35,
    filter: "grayscale(1) saturate(0.2)",
    background: "rgba(0,0,0,0.55)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "none",
  };
}

/** Tiny status pill */
function StatusPill({ status }: { status?: string | null }) {
  const s = (status || "open").trim().toLowerCase();
  const resolved = s === "resolved";
  const followup = s === "needs_followup";
  return (
    <span
      style={{
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.18)",
        opacity: 0.9,
        fontWeight: 800,
      }}
    >
      {resolved ? "RESOLVED" : followup ? "FOLLOW-UP" : "OPEN"}
    </span>
  );
}

export default function Page() {
  const router = useRouter();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  // Detail nav is live
  const ENABLE_DETAIL_NAV = true;

  // Hide resolved by default; show when toggled
  // ALSO: enforce consistent sorting (unresolved first, newest first within groups)
  const visibleHandoffs = useMemo(() => {
    const sorted = [...handoffs].sort((a, b) => {
      const ar = isResolvedStatus(a.status);
      const br = isResolvedStatus(b.status);

      // unresolved first
      if (ar !== br) return ar ? 1 : -1;

      // newest first (use last_update_at when present)
      const at = new Date(a.last_update_at ?? a.created_at).getTime();
      const bt = new Date(b.last_update_at ?? b.created_at).getTime();
      return bt - at;
    });

    if (showResolved) return sorted;
    return sorted.filter((h) => !isResolvedStatus(h.status));
  }, [handoffs, showResolved]);

  const hasData = visibleHandoffs.length > 0;

  async function loadSessionAndFeed() {
    setErrorMsg(null);
    setLoading(true);

    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      setErrorMsg(sessErr.message);
      setLoading(false);
      return;
    }

    const email = sessData.session?.user?.email ?? null;
    const uid = sessData.session?.user?.id ?? null;

    setSessionEmail(email);
    setUserId(uid);

    if (!uid) {
      setHandoffs([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("handoffs")
      .select(
        "id, created_at, summary, category, priority, location_code, status, last_update_at"
      )
      .order("last_update_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setHandoffs((data ?? []) as HandoffRow[]);
    setLoading(false);
  }

  // Auth + initial load
  useEffect(() => {
    loadSessionAndFeed();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
      setUserId(session?.user?.id ?? null);
      loadSessionAndFeed();
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh on focus/visibility (fix “back to feed doesn’t update”)
  useEffect(() => {
    const onFocus = () => loadSessionAndFeed();
    const onVis = () => {
      if (document.visibilityState === "visible") loadSessionAndFeed();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime refresh on inserts/updates
  useEffect(() => {
    const ch = supabase
      .channel("feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "handoffs" },
        loadSessionAndFeed
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "handoffs" },
        loadSessionAndFeed
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "handoff_updates" },
        loadSessionAndFeed
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail(null);
    setUserId(null);
    setHandoffs([]);
    router.push("/auth");
  }

  function onRowClick(id: string) {
    if (!ENABLE_DETAIL_NAV) return;
    router.push(`/handoff/${id}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        fontFamily: "system-ui",
        maxWidth: 980,
        margin: "0 auto",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 260 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>CS HANDOFF — Feed</h1>

          {/* Debug watermark (remove later) */}
          <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>
            FEED_BUILD: RESOLVED_UI_V4_AUTH_BUTTON
          </div>

          <p style={{ opacity: 0.75, marginTop: 8, marginBottom: 0 }}>
            {sessionEmail ? (
              <>
                ✅ Logged in as <b>{sessionEmail}</b>
              </>
            ) : (
              <>Sign in to view and create handoffs.</>
            )}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {/* ✅ NEW: Sign-in button when logged out */}
          {!userId && (
            <button
              onClick={() => router.push("/auth")}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.95,
                fontWeight: 800,
              }}
            >
              Sign In
            </button>
          )}

          <button
            onClick={() => setShowResolved((v) => !v)}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              opacity: 0.9,
              fontWeight: 700,
            }}
          >
            {showResolved ? "Hide Resolved" : "Show Resolved"}
          </button>

          <button
            onClick={() => router.push("/create")}
            disabled={!userId}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "transparent",
              color: "#fff",
              cursor: userId ? "pointer" : "not-allowed",
              opacity: userId ? 0.9 : 0.5,
              fontWeight: 700,
            }}
          >
            + Create Handoff
          </button>

          <button
            onClick={loadSessionAndFeed}
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
            Refresh
          </button>

          {userId && (
            <button
              onClick={signOut}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.75,
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>

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

      <div style={{ marginTop: 18 }}>
        {loading ? (
          <p style={{ opacity: 0.75 }}>Loading handoffs…</p>
        ) : !userId ? (
          <div
            style={{
              border: "1px solid #333",
              padding: 14,
              borderRadius: 12,
              marginTop: 12,
            }}
          >
            <p style={{ margin: 0, opacity: 0.85 }}>
              You’re not signed in. Use the <b>Sign In</b> button above to get a
              magic link.
            </p>

            <button
              onClick={() => router.push("/auth")}
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.95,
                fontWeight: 800,
              }}
            >
              Go to Sign In
            </button>
          </div>
        ) : !hasData ? (
          <div
            style={{
              border: "1px solid #333",
              padding: 14,
              borderRadius: 12,
              marginTop: 12,
            }}
          >
            <p style={{ margin: 0, opacity: 0.85 }}>
              No handoffs to show.{" "}
              {showResolved
                ? "Create one."
                : "Try “Show Resolved” or create a new handoff."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {visibleHandoffs.map((h) => {
              const resolved = isResolvedStatus(h.status);

              const cardStyle: React.CSSProperties = {
                borderRadius: 12,
                padding: 12,
                cursor: ENABLE_DETAIL_NAV ? "pointer" : "default",
                border: "1px solid rgba(255,255,255,0.10)",
              };

              if (resolved) {
                Object.assign(cardStyle, resolvedCardStyle());
              } else {
                Object.assign(cardStyle, glowStyleForPriority(h.priority));
                cardStyle.opacity = 0.95;
              }

              return (
                <div
                  key={h.id}
                  onClick={() => onRowClick(h.id)}
                  role={ENABLE_DETAIL_NAV ? "button" : undefined}
                  tabIndex={ENABLE_DETAIL_NAV ? 0 : -1}
                  style={cardStyle}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 14,
                        lineHeight: 1.2,
                        textDecoration: resolved ? "line-through" : "none",
                        opacity: resolved ? 0.85 : 1,
                        minWidth: 220,
                      }}
                    >
                      {h.summary}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <StatusPill status={h.status} />
                      <div
                        style={{
                          opacity: 0.7,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(
                          h.last_update_at ?? h.created_at
                        ).toLocaleString()}
                      </div>
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
                      Category: <b>{h.category}</b>
                    </span>
                    <span>
                      Priority: <b>{h.priority}</b>
                    </span>
                    {h.location_code && (
                      <span>
                        Location: <b>{h.location_code}</b>
                      </span>
                    )}
                    {h.status && h.status.toLowerCase() === "needs_followup" && (
                      <span>
                        Flag: <b>Needs follow-up</b>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

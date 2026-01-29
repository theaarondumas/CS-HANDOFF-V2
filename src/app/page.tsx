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
  last_update_by_snapshot?: string | null;
};

/**
 * ✅ Canonical cs_status enum values (confirmed):
 * open | needs_followup | resolved
 */
function normStatus(status?: string | null) {
  return (status || "open").trim().toLowerCase();
}
function isResolvedStatus(status?: string | null) {
  return normStatus(status) === "resolved";
}
function isFollowupStatus(status?: string | null) {
  return normStatus(status) === "needs_followup";
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

/** Resolved style — dim but still readable */
function resolvedCardStyle(): React.CSSProperties {
  return {
    opacity: 0.62,
    filter: "grayscale(0.8) saturate(0.35)",
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "none",
  };
}

function priorityDot(priority?: string) {
  const p = (priority || "").toLowerCase();
  const base: React.CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.22)",
    opacity: 0.95,
  };
  if (p === "high") return { ...base, background: "rgba(255,80,80,0.9)" };
  if (p === "medium") return { ...base, background: "rgba(255,190,60,0.9)" };
  return { ...base, background: "rgba(80,255,160,0.85)" };
}

/** Status pill (OPEN / FOLLOW-UP / RESOLVED) */
function StatusPill({ status }: { status?: string | null }) {
  const s = normStatus(status);
  const resolved = s === "resolved";
  const followup = s === "needs_followup";

  const border = resolved
    ? "rgba(255,255,255,0.16)"
    : followup
    ? "rgba(255,190,60,0.35)"
    : "rgba(255,255,255,0.18)";

  const bg = resolved
    ? "rgba(255,255,255,0.06)"
    : followup
    ? "rgba(255,190,60,0.10)"
    : "rgba(255,255,255,0.06)";

  return (
    <span
      style={{
        fontSize: 11,
        padding: "4px 9px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        opacity: 0.95,
        fontWeight: 900,
        letterSpacing: 0.2,
      }}
    >
      {resolved ? "RESOLVED" : followup ? "FOLLOW-UP" : "OPEN"}
    </span>
  );
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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

  const openCount = useMemo(
    () => handoffs.filter((h) => !isResolvedStatus(h.status)).length,
    [handoffs]
  );
  const resolvedCount = useMemo(
    () => handoffs.filter((h) => isResolvedStatus(h.status)).length,
    [handoffs]
  );

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

    // Not signed in
    if (!uid) {
      setHandoffs([]);
      setLoading(false);
      return;
    }

    // ✅ Onboarding gate — must have display_name + shift
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("display_name, shift")
      .eq("user_id", uid)
      .maybeSingle();

    if (profErr) {
      setErrorMsg(profErr.message);
      setLoading(false);
      return;
    }

    const dn = (prof?.display_name || "").trim();
    const sh = (prof?.shift || "").trim();

    if (!dn || !sh) {
      setLoading(false);
      router.push("/onboarding");
      return;
    }

    // Feed fetch includes last_update_by_snapshot
    const { data, error } = await supabase
      .from("handoffs")
      .select(
        "id, created_at, summary, category, priority, location_code, status, last_update_at, last_update_by_snapshot"
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

  // Refresh on focus/visibility
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

  const hasVisible = visibleHandoffs.length > 0;

  // --- Styles ---
  const btnBase: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    opacity: 0.9,
    fontWeight: 750,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        fontFamily: "system-ui",
        maxWidth: 980,
        margin: "0 auto",
        overflowX: "hidden",
        // space for mobile sticky bar
        paddingBottom: 110,
      }}
    >
      {/* ✅ SINGLE HEADER (no duplicates) */}
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
          {/* Title left + build tag right */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 6,
            }}
          >
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
              CS HANDOFF — Feed
            </h1>

            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                whiteSpace: "nowrap",
              }}
            >
              FEED_BUILD: MOBILE_BAR_V1,CARDS_V1 + ONBOARDING_GATE
            </div>
          </div>

          <p style={{ opacity: 0.78, marginTop: 8, marginBottom: 0 }}>
            {sessionEmail ? (
              <>
                ✅ Logged in as <b>{sessionEmail}</b>
              </>
            ) : (
              <>Sign in to view and create handoffs.</>
            )}
          </p>

          <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
            Open: <b>{openCount}</b> · Resolved: <b>{resolvedCount}</b>
          </div>

          {userId && (
            <button
              onClick={signOut}
              style={{
                marginTop: 10,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.75,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Sign out
            </button>
          )}
        </div>

        {/* Desktop action row */}
        <div
          className="cs-desktop-actions"
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {!userId && (
            <button onClick={() => router.push("/auth")} style={btnBase}>
              Sign In
            </button>
          )}

          <button
            onClick={() => setShowResolved((v) => !v)}
            style={btnBase}
            title="Toggle resolved visibility"
          >
            {showResolved ? "Hide Resolved" : "Show Resolved"}
          </button>

          <button
            onClick={() => router.push("/create")}
            disabled={!userId}
            style={{
              ...btnBase,
              cursor: userId ? "pointer" : "not-allowed",
              opacity: userId ? 0.92 : 0.5,
              fontWeight: 850,
            }}
          >
            + Create Handoff
          </button>

          <button
            onClick={loadSessionAndFeed}
            style={{ ...btnBase, opacity: 0.85, fontWeight: 700 }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* CSS: hide desktop actions on mobile; show mobile bar only on mobile */}
      <style>{`
        @media (max-width: 767px) {
          .cs-desktop-actions { display: none !important; }
        }
        @media (min-width: 768px) {
          .cs-mobile-bar { display: none !important; }
        }
        @keyframes csPulse {
          0% { box-shadow: 0 0 0 rgba(255,190,60,0.0); }
          50% { box-shadow: 0 0 16px rgba(255,190,60,0.18); }
          100% { box-shadow: 0 0 0 rgba(255,190,60,0.0); }
        }
      `}</style>

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

      {/* Content */}
      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>
            <p style={{ margin: 0 }}>Loading handoffs…</p>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 78,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                />
              ))}
            </div>
          </div>
        ) : !userId ? (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              padding: 14,
              borderRadius: 12,
              marginTop: 12,
            }}
          >
            <p style={{ margin: 0, opacity: 0.85 }}>
              You’re not signed in. Tap <b>Sign In</b> to get a magic link.
            </p>

            <button
              onClick={() => router.push("/auth")}
              style={{ ...btnBase, marginTop: 12, fontWeight: 900 }}
            >
              Go to Sign In
            </button>
          </div>
        ) : !hasVisible ? (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              padding: 16,
              borderRadius: 14,
              marginTop: 12,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>
              All clear.
            </div>
            <div style={{ opacity: 0.82, fontSize: 13 }}>
              {showResolved
                ? "No handoffs yet. Create the first one."
                : "No open handoffs right now. You can create one, or show resolved."}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <button
                onClick={() => router.push("/create")}
                style={{
                  ...btnBase,
                  fontWeight: 900,
                  opacity: 0.95,
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                + Create Handoff
              </button>
              <button
                onClick={() => setShowResolved(true)}
                style={{ ...btnBase, opacity: 0.85 }}
              >
                Show Resolved
              </button>
            </div>
          </div>
        ) : (
          <>
            {openCount === 1 && !showResolved && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  opacity: 0.9,
                  fontSize: 13,
                }}
              >
                No other open handoffs right now.
              </div>
            )}

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {visibleHandoffs.map((h) => {
                const resolved = isResolvedStatus(h.status);
                const followup = isFollowupStatus(h.status);
                const ts = h.last_update_at ?? h.created_at;

                const cardStyle: React.CSSProperties = {
                  borderRadius: 14,
                  padding: 12,
                  cursor: ENABLE_DETAIL_NAV ? "pointer" : "default",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.02)",
                };

                if (resolved) {
                  Object.assign(cardStyle, resolvedCardStyle());
                } else {
                  Object.assign(cardStyle, glowStyleForPriority(h.priority));
                  cardStyle.opacity = 0.96;
                }

                if (followup && !resolved) {
                  cardStyle.animation = "csPulse 2.2s ease-in-out infinite";
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
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            letterSpacing: 0.4,
                            opacity: 0.9,
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.04)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h.location_code ? h.location_code : "—"}
                        </span>

                        <span style={{ opacity: 0.65, fontSize: 12 }}>
                          {h.category}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={priorityDot(h.priority)} />
                      </div>
                    </div>

                    <div
                      style={{
                        fontWeight: 950,
                        fontSize: 15,
                        lineHeight: 1.25,
                        opacity: resolved ? 0.9 : 1,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {h.summary}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <StatusPill status={h.status} />
                        {followup && !resolved && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,190,60,0.28)",
                              background: "rgba(255,190,60,0.08)",
                              fontWeight: 900,
                              opacity: 0.95,
                            }}
                          >
                            Needs follow-up
                          </span>
                        )}
                      </div>

                      <div style={{ opacity: 0.68, fontSize: 12, whiteSpace: "nowrap" }}>
                        {fmtTime(ts)}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        opacity: 0.72,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={h.last_update_by_snapshot ?? ""}
                    >
                      Last update: <b>{h.last_update_by_snapshot ?? "—"}</b>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Mobile sticky bottom action bar */}
      <div
        className="cs-mobile-bar"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "10px 12px",
          paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
          background: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          zIndex: 9999,
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => router.push(userId ? "/create" : "/auth")}
              style={{
                ...btnBase,
                flex: 1,
                fontWeight: 950,
                opacity: userId ? 0.96 : 0.9,
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              {userId ? "+ Create" : "Sign In"}
            </button>

            <button
              onClick={loadSessionAndFeed}
              style={{
                ...btnBase,
                width: 110,
                opacity: 0.85,
                fontWeight: 800,
              }}
            >
              Refresh
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <button
              onClick={() => setShowResolved((v) => !v)}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.92,
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              {showResolved ? "Hide Resolved" : "Show Resolved"}
            </button>

            <div style={{ opacity: 0.7, fontSize: 12 }}>
              Open: <b>{openCount}</b>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

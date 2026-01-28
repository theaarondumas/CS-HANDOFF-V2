"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  opacity: 0.95,
  fontWeight: 900,
};

export default function OnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("CS");
  const [shift, setShift] = useState<"AM" | "PM" | "NOC">("AM");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setErrorMsg(null);
      setLoading(true);

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      const uid = data.session?.user?.id ?? null;
      const em = data.session?.user?.email ?? null;

      setUserId(uid);
      setEmail(em);

      if (!uid) {
        setLoading(false);
        router.push("/auth");
        return;
      }

      // If profile already exists, prefill
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, role, shift")
        .eq("user_id", uid)
        .maybeSingle();

      if (prof?.display_name) setDisplayName(prof.display_name);
      if (prof?.role) setRole(prof.role);
      if (prof?.shift === "AM" || prof?.shift === "PM" || prof?.shift === "NOC")
        setShift(prof.shift);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setErrorMsg(null);

    if (!userId) return;

    const dn = displayName.trim().toUpperCase();
    if (dn.length < 2 || dn.length > 10) {
      setErrorMsg("Initials must be 2–10 characters (e.g., KM, MA, FR).");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        display_name: dn,
        role: role.trim() || "CS",
        shift,
      },
      { onConflict: "user_id" }
    );

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push("/");
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", padding: 16, fontFamily: "system-ui" }}>
        <p style={{ opacity: 0.8 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        fontFamily: "system-ui",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 26 }}>Set your display info</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        This is what coworkers see. No full names. No PHI.
        {email ? (
          <>
            <br />
            Signed in as <b>{email}</b>
          </>
        ) : null}
      </p>

      {errorMsg && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid tomato",
          }}
        >
          <b style={{ color: "tomato" }}>Error:</b> {errorMsg}
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ opacity: 0.8, fontSize: 13, fontWeight: 800 }}>
            Initials / Display name
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="KM"
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              color: "#fff",
              outline: "none",
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ opacity: 0.8, fontSize: 13, fontWeight: 800 }}>
            Role
          </span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="CS"
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              color: "#fff",
              outline: "none",
              fontSize: 16,
              fontWeight: 800,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ opacity: 0.8, fontSize: 13, fontWeight: 800 }}>
            Shift
          </span>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value as any)}
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              outline: "none",
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
            <option value="NOC">NOC</option>
          </select>
        </label>

        <button onClick={save} style={{ ...btn, opacity: saving ? 0.6 : 0.95 }}>
          {saving ? "Saving…" : "Save & Continue"}
        </button>

        <button
          onClick={() => router.push("/")}
          style={{ ...btn, opacity: 0.75, fontWeight: 800 }}
        >
          Back to Feed
        </button>
      </div>
    </main>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSend = useMemo(() => {
    return email.trim().includes("@") && email.trim().includes(".") && !sending;
  }, [email, sending]);

  async function sendLink() {
    setMsg(null);
    setErr(null);
    setSending(true);
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      setMsg("✅ Magic link sent. Check your email and open it on this device.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send magic link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0, fontSize: 26 }}>Sign In</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        We’ll email you a magic link. Open it on the same device/browser.
      </p>

      {err && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid tomato" }}>
          <b style={{ color: "tomato" }}>Error:</b> {err}
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(80,255,160,0.4)" }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 420 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@hospital.org"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #333",
            fontSize: 16, // iOS friendly
          }}
        />

        <button
          onClick={sendLink}
          disabled={!canSend}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #333",
            background: "transparent",
            color: "#fff",
            fontWeight: 900,
            cursor: !canSend ? "not-allowed" : "pointer",
            opacity: !canSend ? 0.5 : 0.95,
          }}
        >
          {sending ? "Sending…" : "Send Magic Link"}
        </button>

        <button
          onClick={() => router.push("/")}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #333",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
            opacity: 0.85,
          }}
        >
          Back to Feed
        </button>
      </div>
    </main>
  );
}

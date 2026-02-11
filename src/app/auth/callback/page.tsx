"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Finishing sign-in…");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setMsg(`Auth error: ${error.message}`);
            return;
          }
        }

        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          setMsg("No session found. Try signing in again.");
          return;
        }

        router.replace("/");
      } catch (e: any) {
        setMsg(`Callback failed: ${e?.message}`);
      }
    };

    run();
  }, [router]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", color: "#fff" }}>
      <h1>CS HANDOFF</h1>
      <p>{msg}</p>
    </main>
  );
}
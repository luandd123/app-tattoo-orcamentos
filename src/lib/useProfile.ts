"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { Profile } from "@/lib/types";

export function useProfile() {
  const supabase = supabaseBrowser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setLoading(false);
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (active) {
        setProfile(data as Profile);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { profile, loading, isAdmin: profile?.role === "admin", canEdit: profile?.role === "admin" || profile?.role === "atendente" };
}

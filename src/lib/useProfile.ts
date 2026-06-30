"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { Profile } from "@/lib/types";
import { getCurrentUserAndProfile } from "@/lib/profileUtils";

export function useProfile() {
  const supabase = supabaseBrowser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorType, setErrorType] = useState<"auth" | "profile" | "permission" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await getCurrentUserAndProfile(supabase);
    if (result.errorMessage) {
      console.error("useProfile:", result.errorType, result.errorMessage);
    }
    setProfile(result.profile);
    setErrorType(result.errorType);
    setErrorMessage(result.errorMessage);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return {
    profile,
    loading,
    errorType,
    errorMessage,
    reload: load,
    isAdmin: profile?.role === "admin",
    canEdit: profile?.role === "admin" || profile?.role === "attendant",
  };
}

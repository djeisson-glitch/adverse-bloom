import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GoogleToken {
  id: string;
  team_member_id: string;
  google_email: string | null;
  expires_at: string;
}

export function useGoogleTokens() {
  return useQuery({
    queryKey: ["google_tokens"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("google_tokens")
        .select("id, team_member_id, google_email, expires_at");
      if (error) throw error;
      return data as GoogleToken[];
    },
  });
}

export function getGoogleAuthUrl(teamMemberId: string) {
  const clientId = "129413297764-1f5ui70ae8nf08e4ibqj8b6u1f6bmthp.apps.googleusercontent.com";
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const redirectUri = encodeURIComponent(`https://${projectId}.supabase.co/functions/v1/google-auth-callback`);
  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email");
  
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${teamMemberId}`;
}

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // O profile normalmente já vem pronto do banco: no 1º login com Google, o
  // trigger trg_provisionar_membro cria profile + papel a partir do convite.
  // Aqui a gente só carrega — e completa a foto/nome do Google se faltar.
  const ensureProfile = async (u: User) => {
    const meta = u.user_metadata || {};
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", u.id)
      .maybeSingle();

    if (data) {
      // Acesso revogado: o ban no auth impede novo login/refresh, mas o token
      // atual ainda valeria por ~1h. Derruba a sessão na hora.
      if (data.ativo === false) {
        setProfile(null);
        await supabase.auth.signOut();
        return;
      }
      // Completa o que o convite não tinha (foto do Google, nome).
      const patch: Record<string, any> = {};
      const foto = meta.avatar_url || meta.picture;
      if (foto && !data.avatar_url) patch.avatar_url = foto;
      if (!data.full_name && (meta.full_name || meta.name)) patch.full_name = meta.full_name || meta.name;
      if (Object.keys(patch).length > 0) {
        const { data: atualizado } = await supabase
          .from("profiles").update(patch).eq("id", u.id).select().maybeSingle();
        setProfile(atualizado ?? data);
        return;
      }
      setProfile(data);
      return;
    }

    // Fallback (não deveria acontecer): cria o mínimo pra não travar a sessão.
    const { data: created } = await supabase
      .from("profiles")
      .insert({
        id: u.id,
        full_name: meta.full_name || meta.name || u.email?.split("@")[0] || "",
        email: u.email || "",
        avatar_url: meta.avatar_url || meta.picture || "",
      })
      .select()
      .maybeSingle();
    setProfile(created);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => ensureProfile(session.user), 0);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        ensureProfile(session.user);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

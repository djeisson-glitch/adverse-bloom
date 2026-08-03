import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { hojeISO } from "@/lib/dataLocal";

/**
 * "Seu dia" — o resumo que a IA escreve toda manhã (edge function digest-diario),
 * agora em destaque no topo da Início e da Minha mesa, em vez de perdido no meio
 * das notificações. Puxa o digest de hoje da pessoa; se ainda não saiu, deixa
 * gerar na hora. Ao aparecer aqui, marca o digest como lido pra não duplicar no sino.
 */
export function ResumoDoDia() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);
  const [erroGerar, setErroGerar] = useState<string | null>(null);
  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);
  const hoje = hojeISO();

  const { data: digest, isLoading } = useQuery({
    queryKey: ["resumo-dia", user?.id, hoje],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("notificacoes")
        .select("id, corpo, created_at, lida_em")
        .eq("user_id", user!.id)
        .eq("tipo", "digest")
        .gte("created_at", hojeInicio.toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      return ((data as any[]) || [])[0] || null;
    },
    refetchOnWindowFocus: true,
  });

  // Ao mostrar aqui, tira do "não lido" do sino — o destaque agora é este card.
  useEffect(() => {
    if (digest && !digest.lida_em && user?.id) {
      (supabase as any)
        .from("notificacoes")
        .update({ lida_em: new Date().toISOString() })
        .eq("id", digest.id)
        .then(() => qc.invalidateQueries({ queryKey: ["notificacoes", user.id] }));
    }
  }, [digest, user?.id, qc]);

  const gerarAgora = async () => {
    if (!user?.id) return;
    setGerando(true);
    setErroGerar(null);
    try {
      const { data, error } = await supabase.functions.invoke("digest-diario", { body: { user_id: user.id } });
      if (error) throw error;
      if ((data as any)?.error) { setErroGerar((data as any).error); return; }
      await qc.invalidateQueries({ queryKey: ["resumo-dia", user.id, hoje] });
    } catch {
      setErroGerar("Não deu pra gerar o resumo agora.");
    } finally {
      setGerando(false);
    }
  };

  if (isLoading) return null;
  // Sem resumo e sem erro: não ocupa linha nenhuma. Um card dizendo "seu
  // resumo sai toda manhã" é instrução, não informação.
  if (!digest?.corpo && !gerando && !erroGerar) return null;

  // UMA LINHA, sem card e sem cabeçalho. A data saiu (está no topo da tela),
  // o título "Seu dia" saiu (o ícone já marca que é a IA) e o botão de
  // atualizar virou ícone.
  return (
    <div className="flex items-start gap-2 px-1 text-sm">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <p className="flex-1 leading-snug text-muted-foreground">
        {digest?.corpo || (gerando ? "Lendo o que você tem pra hoje…" : erroGerar)}
      </p>
      <button
        onClick={gerarAgora}
        disabled={gerando}
        title="Atualizar o resumo"
        className="shrink-0 rounded p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
      >
        {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  const hojeISO = hojeInicio.toISOString().slice(0, 10);

  const { data: digest, isLoading } = useQuery({
    queryKey: ["resumo-dia", user?.id, hojeISO],
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
      await qc.invalidateQueries({ queryKey: ["resumo-dia", user.id, hojeISO] });
    } catch {
      setErroGerar("Não deu pra gerar o resumo agora.");
    } finally {
      setGerando(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card className="glass-card border-primary/30">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Seu dia
            <span className="text-xs font-normal text-muted-foreground">
              · {hojeInicio.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-primary hover:text-primary"
            onClick={gerarAgora}
            disabled={gerando}
            title="Gerar o resumo de agora"
          >
            {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {digest ? "Atualizar" : "Gerar agora"}
          </Button>
        </div>

        {digest?.corpo ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{digest.corpo}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {erroGerar
              ? erroGerar
              : gerando
              ? "A IA está lendo o que você tem pra hoje…"
              : "Seu resumo sai toda manhã. Sem nada pendente agora — ou clique em “Gerar agora”."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

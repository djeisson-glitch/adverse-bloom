import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check } from "lucide-react";
import { MergulhoForm } from "@/components/MergulhoForm";

/**
 * Briefing / Mergulho público — link pro cliente responder (ou pra equipe
 * preencher na reunião). Salva sozinho enquanto escreve, então nada se perde.
 */
export default function BriefingPublico() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: cfg, isLoading, isError } = useQuery({
    queryKey: ["mergulho-publico", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mergulho_publico", { _token: token });
      if (error) throw error;
      return data as { projeto: string; cliente_nome: string; mergulho: Record<string, any> } | null;
    },
  });

  useEffect(() => {
    if (cfg && dados === null) setDados(cfg.mergulho || {});
  }, [cfg, dados]);

  const salvar = async (d: Record<string, any>) => {
    setStatus("saving");
    const { error } = await (supabase as any).rpc("mergulho_salvar", { _token: token, _dados: d });
    setStatus(error ? "idle" : "saved");
  };

  const onChange = (key: string, val: string) => {
    setDados((prev) => {
      const novo = { ...(prev || {}), [key]: val };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => salvar(novo), 800);
      return novo;
    });
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (isError || !cfg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-1 bg-background px-6 text-center">
        <p className="text-lg font-bold text-foreground">Formulário indisponível</p>
        <p className="text-sm text-muted-foreground">O link pode estar incorreto ou desativado. Fale com a Adverse.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8">
          <span className="text-lg font-extrabold tracking-tight">adverse.rec <span className="text-primary">//</span></span>
          <h1 className="mt-4 text-2xl font-bold">Briefing do projeto</h1>
          <p className="text-sm text-muted-foreground">
            {cfg.cliente_nome ? `${cfg.cliente_nome} · ` : ""}{cfg.projeto || "novo projeto"} — nos conte o máximo que puder. Quanto mais contexto, melhor a ideia.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {status === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" /> salvando…</> : status === "saved" ? <><Check className="h-3 w-3 text-success" /> salvo automaticamente</> : "Salva sozinho enquanto você escreve."}
          </p>
        </header>

        <MergulhoForm value={dados || {}} onChange={onChange} />

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Pode fechar quando quiser — suas respostas ficam salvas. Nosso time revisa e volta com você.
        </p>
      </div>
    </div>
  );
}

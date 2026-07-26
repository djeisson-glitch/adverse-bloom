import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sprout } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { STAGES, isWonStage } from "@/hooks/useDeals";
import { usePermissions } from "@/hooks/usePermissions";
import { CabecalhoFrente, Kpi, ListaFrente, diasDesde, type LinhaFrente } from "@/components/frentes/Blocos";

/**
 * Frente COMERCIAL — o que está esfriando.
 *
 * A /orcamentos é o kanban operacional. Aqui a pergunta é outra: "o que está
 * parado tempo demais e vai morrer se ninguém tocar?". Negócio esquecido não
 * aparece no kanban — ele fica lá, parado, parecendo saudável.
 */

const ABERTO = (stage: string) => !isWonStage(stage) && stage !== "perdido";

export default function FrenteComercial() {
  const { canSeeMoney } = usePermissions();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["frente-comercial"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deals")
        .select("id, numero, title, stage, value, updated_at, created_at, client:clients(name)")
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: demandas = [] } = useQuery({
    queryKey: ["frente-demandas"],
    queryFn: async () => (await (supabase as any)
      .from("demandas").select("id, nome_projeto, solicitante_nome, created_at").eq("status", "nova")).data || [],
  });

  const dados = useMemo(() => {
    const abertos = deals.filter((d) => ABERTO(d.stage));
    const valorFunil = abertos.reduce((s, d) => s + Number(d.value || 0), 0);

    const porEstagio = STAGES.filter((s) => ABERTO(s.id)).map((s) => {
      const lista = abertos.filter((d) => d.stage === s.id);
      return {
        key: s.id,
        titulo: s.label,
        meta: lista.length === 0 ? "nenhum negócio" : `${lista.length} negócio${lista.length > 1 ? "s" : ""}`,
        direita: canSeeMoney ? formatCurrency(lista.reduce((t, d) => t + Number(d.value || 0), 0)) : undefined,
        link: "/orcamentos",
      } as LinhaFrente;
    });

    // Esfriando: aberto e sem nenhuma escrita há 10+ dias.
    const esfriando = abertos
      .map((d) => ({ d, dias: diasDesde(d.updated_at || d.created_at) ?? 0 }))
      .filter((x) => x.dias >= 10)
      .sort((a, b) => b.dias - a.dias)
      .map(({ d, dias }): LinhaFrente => ({
        key: d.id,
        titulo: d.title || "(sem título)",
        meta: [d.client?.name, STAGES.find((s) => s.id === d.stage)?.label].filter(Boolean).join(" · "),
        direita: `${dias}d parado`,
        alerta: dias >= 21,
        link: `/orcamentos/${d.id}`,
      }));

    const novas = demandas.map((d: any): LinhaFrente => ({
      key: d.id,
      titulo: d.nome_projeto,
      meta: `pedido por ${d.solicitante_nome}`,
      link: "/demandas",
    }));

    return {
      abertos: abertos.length,
      valorFunil,
      propostas: abertos.filter((d) => d.stage === "proposta").length,
      porEstagio,
      esfriando,
      novas,
    };
  }, [deals, demandas, canSeeMoney]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <CabecalhoFrente
        icone={Sprout}
        titulo="Comercial"
        sub="O que está esfriando — o kanban do dia a dia está em Orçamentos."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="No funil" valor={dados.abertos} href="/orcamentos" />
        {canSeeMoney && <Kpi label="Valor no funil" valor={formatCurrency(dados.valorFunil)} hint="soma dos abertos" />}
        <Kpi label="Propostas enviadas" valor={dados.propostas} hint="esperando resposta" />
        <Kpi
          label="Demandas novas"
          valor={dados.novas.length}
          href="/demandas"
          alerta={dados.novas.length > 0}
          hint={dados.novas.length > 0 ? "ninguém pegou ainda" : undefined}
        />
      </div>

      <ListaFrente
        titulo="Esfriando"
        hint="aberto e sem movimento há 10 dias ou mais"
        carregando={isLoading}
        linhas={dados.esfriando}
        vazio="Nada parado — o funil inteiro teve movimento recente."
      />

      {dados.novas.length > 0 && (
        <ListaFrente titulo="Demandas novas" hint="chegaram pelo formulário" linhas={dados.novas} vazio="" />
      )}

      <ListaFrente
        titulo="Funil por etapa"
        carregando={isLoading}
        linhas={dados.porEstagio}
        vazio="Funil vazio."
        verTudo={{ label: "abrir o kanban", href: "/orcamentos" }}
      />
    </div>
  );
}

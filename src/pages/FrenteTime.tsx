import { estaAtrasado } from "@/lib/prazoEntregavel";
import { primeiroNome } from "@/lib/pessoa";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UsersRound } from "lucide-react";
import { CabecalhoFrente, Kpi, ListaFrente, type LinhaFrente } from "@/components/frentes/Blocos";

/**
 * Frente TIME — quem está carregando o quê.
 *
 * A /capacidade projeta horas contra disponibilidade. Aqui a pergunta é mais
 * simples e mais imediata: "quem está com peça demais na mão, e quem está
 * livre?". Serve pra decidir pra quem vai a próxima demanda.
 */

const ATIVO = ["pendente", "em_edicao", "em_pausa", "revisao", "revisao_n1", "revisao_n2", "pronto", "ajuste_solicitado", "ajuste_interno"];

export default function FrenteTime() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: pessoas = [], isLoading: carregandoPessoas } = useQuery({
    queryKey: ["frente-time-pessoas"],
    queryFn: async () => (await (supabase as any)
      .from("profiles").select("id, full_name, email, ativo").order("full_name")).data || [],
  });

  const { data: entregaveis = [], isLoading } = useQuery({
    queryKey: ["frente-time-entregaveis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, data_entrega, prazo_interno, responsavel_id")
        .in("status", ATIVO);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: tarefas = [] } = useQuery({
    queryKey: ["frente-time-tarefas"],
    queryFn: async () => (await (supabase as any)
      .from("tasks").select("id, assigned_user_id").eq("completed", false)).data || [],
  });

  const dados = useMemo(() => {
    const ativos = pessoas.filter((p: any) => p.ativo !== false);

    const carga = ativos.map((p: any) => {
      const meus = entregaveis.filter((e) => e.responsavel_id === p.id);
      const atrasados = meus.filter((e) => estaAtrasado(e, hoje)).length;
      const tar = tarefas.filter((t: any) => t.assigned_user_id === p.id).length;
      return {
        id: p.id,
        nome: primeiroNome(p.full_name || p.email),
        entregaveis: meus.length,
        atrasados,
        tarefas: tar,
      };
    });

    // Ordena por quem está mais carregado — atrasado pesa mais que volume.
    carga.sort((a, b) => (b.atrasados - a.atrasados) || (b.entregaveis - a.entregaveis));

    const linhas: LinhaFrente[] = carga.map((c) => ({
      key: c.id,
      titulo: c.nome,
      meta: c.entregaveis === 0 && c.tarefas === 0
        ? "sem nada na mão"
        : [
            c.entregaveis > 0 ? `${c.entregaveis} entregável${c.entregaveis > 1 ? "eis" : ""}` : null,
            c.tarefas > 0 ? `${c.tarefas} tarefa${c.tarefas > 1 ? "s" : ""}` : null,
          ].filter(Boolean).join(" · "),
      direita: c.atrasados > 0 ? `${c.atrasados} atrasado${c.atrasados > 1 ? "s" : ""}` : undefined,
      alerta: c.atrasados > 0,
    }));

    const semDono = entregaveis.filter((e) => !e.responsavel_id).length;

    return {
      pessoas: ativos.length,
      semDono,
      linhas,
      livres: carga.filter((c) => c.entregaveis === 0 && c.tarefas === 0).length,
      sobrecarregados: carga.filter((c) => c.atrasados > 0).length,
    };
  }, [pessoas, entregaveis, tarefas, hoje]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <CabecalhoFrente
        icone={UsersRound}
        titulo="Time"
        sub="Quem está carregando o quê — pra decidir pra quem vai a próxima."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Pessoas ativas" valor={dados.pessoas} href="/time" />
        <Kpi label="Com atraso na mão" valor={dados.sobrecarregados} alerta={dados.sobrecarregados > 0} />
        <Kpi label="Sem nada na mão" valor={dados.livres} hint="disponível pra pegar" />
        <Kpi label="Peças sem dono" valor={dados.semDono} alerta={dados.semDono > 0} hint="ninguém começa sem isso" />
      </div>

      <ListaFrente
        titulo="Carga por pessoa"
        hint="quem tem atraso vem primeiro"
        carregando={isLoading || carregandoPessoas}
        linhas={dados.linhas}
        vazio="Ninguém ativo no time ainda."
        verTudo={{ label: "ver capacidade", href: "/capacidade" }}
      />
    </div>
  );
}

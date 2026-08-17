import { estaAtrasado, prazoDe } from "@/lib/prazoEntregavel";
import { hojeISO, emDiasISO } from "@/lib/dataLocal";
import { primeiroNome } from "@/lib/pessoa";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clapperboard } from "lucide-react";
import { statusLabel } from "@/lib/statusEntregavel";
import { CabecalhoFrente, Kpi, ListaFrente, diasDesde, type LinhaFrente } from "@/components/frentes/Blocos";

/**
 * Frente de PRODUÇÃO — o acompanhamento, não o operacional.
 *
 * A /projetos e a /pos-producao mostram TUDO. Esta tela responde outra
 * pergunta: "onde a produção está travada agora?". Por isso ela não lista o
 * que está saudável — só o que precisa de decisão: parado, atrasado, sem dono.
 */

const ATIVO = ["pendente", "pronto_editar", "em_edicao", "em_pausa", "revisao", "revisao_n1", "revisao_n2", "pronto", "com_cliente", "ajuste_solicitado", "ajuste_interno"];

const fmtDia = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";

export default function FrenteProducao() {
  const hoje = hojeISO();
  const em7 = emDiasISO(7);

  const { data: entregaveis = [], isLoading } = useQuery({
    queryKey: ["frente-producao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, data_entrega, prazo_interno, responsavel_id, updated_at, project:projects(id, numero, name, client_name)")
        .in("status", ATIVO);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["frente-perfis"],
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name, email, avatar_url")).data || [],
  });
  const nome = (id?: string | null) => {
    const p = profiles.find((x: any) => x.id === id);
    return p ? primeiroNome(p.full_name || p.email) : "—";
  };

  const dados = useMemo(() => {
    const prazo = prazoDe;
    const ctx = (e: any) =>
      [e.project?.client_name, e.project?.numero].filter(Boolean).join(" · ");

    const atrasados = entregaveis
      .filter((e) => estaAtrasado(e, hoje))
      .sort((a, b) => (prazo(a) || "").localeCompare(prazo(b) || ""));

    const semana = entregaveis
      .filter((e) => prazo(e) && prazo(e) >= hoje && prazo(e) <= em7)
      .sort((a, b) => (prazo(a) || "").localeCompare(prazo(b) || ""));

    const semDono = entregaveis.filter((e) => !e.responsavel_id);

    // Parado = não teve nenhuma escrita há dias. É o melhor sinal de peça
    // esquecida que existe sem inventar campo novo.
    const parados = entregaveis
      .map((e) => ({ e, dias: diasDesde(e.updated_at) ?? 0 }))
      .filter((x) => x.dias >= 5)
      .sort((a, b) => b.dias - a.dias);

    const linha = (e: any, extra?: Partial<LinhaFrente>): LinhaFrente => ({
      key: e.id,
      titulo: e.titulo,
      meta: [statusLabel(e.status), ctx(e), nome(e.responsavel_id)].filter(Boolean).join(" · "),
      link: `/projetos/${e.project?.id}/entregaveis/${e.id}`,
      ...extra,
    });

    return {
      total: entregaveis.length,
      comCliente: entregaveis.filter((e) => e.status === "com_cliente").length,
      prontos: entregaveis.filter((e) => e.status === "pronto").length,
      atrasados: atrasados.map((e) => linha(e, { alerta: true, direita: fmtDia(prazo(e)) })),
      semana: semana.map((e) => linha(e, { direita: fmtDia(prazo(e)) })),
      semDono: semDono.map((e) => linha(e)),
      parados: parados.map(({ e, dias }) => linha(e, { alerta: dias >= 15, direita: `${dias}d` })),
    };
  }, [entregaveis, profiles, hoje, em7]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <CabecalhoFrente
        icone={Clapperboard}
        titulo="Produção"
        sub="Onde a produção está travada agora — o resto está em Projetos."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Entregáveis abertos" valor={dados.total} href="/pos-producao" />
        <Kpi label="Atrasados" valor={dados.atrasados.length} alerta={dados.atrasados.length > 0} />
        <Kpi label="Com o cliente" valor={dados.comCliente} hint="fora do nosso controle" />
        <Kpi label="Prontos pra enviar" valor={dados.prontos} hint="esperando alguém enviar" />
      </div>

      <ListaFrente
        titulo="Atrasado"
        hint="passou do prazo"
        carregando={isLoading}
        linhas={dados.atrasados}
        vazio="Nenhum entregável atrasado 🎉"
      />

      <ListaFrente
        titulo="Parado"
        hint="sem nenhuma movimentação há 5 dias ou mais"
        carregando={isLoading}
        linhas={dados.parados}
        vazio="Nada esquecido — tudo teve movimento recente."
      />

      {dados.semDono.length > 0 && (
        <ListaFrente
          titulo="Sem responsável"
          hint="ninguém vai começar até alguém assumir"
          linhas={dados.semDono}
          vazio=""
        />
      )}

      <ListaFrente
        titulo="Vence nos próximos 7 dias"
        carregando={isLoading}
        linhas={dados.semana}
        vazio="Nada vencendo na semana."
        verTudo={{ label: "ver calendário", href: "/calendario" }}
      />
    </div>
  );
}

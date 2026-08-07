import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { fmtDuracao } from "@/lib/duracao";
import { PRODUTORA } from "@/lib/produtora";
import { useVoltar } from "@/hooks/useVoltar";
import { primeiroDiaISO } from "@/lib/dataLocal";
import {
  alteracoesDoPeriodo, contarEntregues, cobrancaDaPeca, conferePrecos,
} from "@/lib/fechamentoCliente";

/**
 * Carta de fechamento do mês — o documento que vai pro cliente.
 *
 * Dois formatos, porque os dois contratos respondem perguntas diferentes:
 *
 *  • TABELA (Sicredi Região): o cliente compra PEÇAS. O relatório mostra o
 *    que foi entregue, de que tipo, e o resumo por tipo. Alteração aparece
 *    como número — não é cobrada, mas o cliente precisa ver que existiu.
 *
 *  • HORAS (Sicredi Sul Minas): o cliente compra TEMPO. O relatório mostra a
 *    hora por entregável, separando edição de alteração, e quem pediu o quê.
 *
 * Impressão: `window.print()` com @media print escondendo a barra. O papel é
 * A4 e o preto vira branco — carta de cobrança se imprime, se assina e se
 * arquiva; fundo escuro gasta tinta e fica ilegível no fax do financeiro.
 */
/** 2026-07-30 → 30/07/26. Fora do componente: a célula abaixo também usa. */
const fmtISO = (iso?: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—";

/**
 * Data de solicitação. Só a demanda é fonte confiável — `created_at` da peça
 * é data de CADASTRO, e nas peças importadas do ClickUp isso é o dia da
 * importação (todas iguais, o que o Djêisson viu no fechamento). Sem demanda,
 * mostra o início do trabalho com "~", que diz ao leitor que é referência e
 * não o pedido.
 */
const SEM_SOLICITANTE = "Sem solicitante";

/** 1,5 — não 1.5. Vírgula decimal, e sem zero à toa em número inteiro. */
const qtdBR = (n: number) => String(Number(n)).replace(".", ",");

/** A data que a linha mostra — e por onde ela é ordenada. */
function dataDaLinha(l: any): string {
  const d = (l.veioDeDemanda && l.solicitadoEm) || l.inicioEm;
  return d ? String(d).slice(0, 10) : "";
}

function CelulaSolicitado({ linha }: { linha: any }) {
  // Sem o "~" que existia antes. Ele marcava "data aproximada" de quando a
  // referência era o primeiro apontamento de hora — um palpite. Hoje é a data
  // de CRIAÇÃO do job, a mesma que define o período do documento: não há
  // aproximação nenhuma pra sinalizar, e o til só levantava dúvida sobre um
  // número exato.
  const d = (linha.veioDeDemanda && linha.solicitadoEm) || linha.inicioEm;
  return <>{d ? fmtISO(String(d).slice(0, 10)) : "—"}</>;
}

export default function RelatorioCliente() {
  const { clientId, mes } = useParams();
  const voltar = useVoltar("/faturamento-mensal");
  const ref = `${mes}-01`;
  const [ano, m] = (mes || "").split("-").map(Number);
  const fim = primeiroDiaISO(ano, m + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-cliente", clientId, mes],
    queryFn: async () => {
      // Projetos primeiro: o resto filtra por eles. Antes as horas vinham
      // filtradas por `start_at` no mês, e era daí que o relatório divergia
      // da fatura — o fechamento passou a cortar o mês pela CRIAÇÃO do job, e
      // aqui continuava cortando por quando a hora foi lançada.
      const proj = await (supabase as any)
        .from("projects").select("id, name, numero, client_id, faturamento, criado_em, created_at")
        .eq("client_id", clientId);
      const ids = (proj.data || []).map((p: any) => p.id) as string[];
      // Projetos que seguem o mês. Serve só pra hora lançada solta, sem peça:
      // não há peça a quem perguntar, então quem decide é o projeto.
      const projMensais = new Set(
        (proj.data || []).filter((p: any) => (p.faturamento || "mensal") === "mensal").map((p: any) => p.id),
      );

      // Quais PEÇAS entram no fechamento do mês. Vem da mesma view que a
      // função de fechamento usa — a carta não recalcula a regra.
      //
      // Antes esta tela filtrava por PROJETO ("faturamento = mensal"), e isso
      // deixou de bastar quando a separação passou a valer por peça: uma peça
      // marcada pra nota separada continuaria impressa numa carta que não a
      // cobra, e uma peça resgatada de um projeto avulso sumiria de uma carta
      // que a cobra. Nos dois casos o cliente lê um documento que discorda da
      // fatura — o erro que esta carta não pode cometer.
      const fatur = await (supabase as any)
        .from("deliverables_faturamento").select("id, faturamento_efetivo").eq("client_id", clientId);
      const pecasMensais = new Set(
        ((fatur.data || []) as any[]).filter((r) => r.faturamento_efetivo === "mensal").map((r) => r.id),
      );

      const [cli, fat, ent, criacao, alt, dem, dia, hrs, prof, precos] = await Promise.all([
        (supabase as any).from("clients").select("*").eq("id", clientId).maybeSingle(),
        (supabase as any).from("faturamento_mensal").select("*").eq("client_id", clientId).eq("ref_mes", ref).maybeSingle(),
        ids.length
          ? (supabase as any).from("deliverables")
              .select("id, codigo, titulo, project_id, data_entrega, created_at, tipo_cobranca, cobranca_percent, status, solicitado_por")
              .in("project_id", ids)
          : Promise.resolve({ data: [] }),
        // A data que decide o mês — a mesma fonte que o fechamento usa.
        (supabase as any).from("deliverables_criacao").select("id, criacao_efetiva")
          .gte("criacao_efetiva", ref).lt("criacao_efetiva", fim),
        (supabase as any).from("deliverable_alteracoes").select("id, deliverable_id, titulo, created_at, criado_por"),
        (supabase as any).from("demandas").select("id, projeto_id, solicitante_nome, created_at").eq("client_id", clientId),
        (supabase as any).from("diarias_por_dia").select("*").eq("client_id", clientId).gte("data", ref).lt("data", fim),
        // TODAS as horas dos projetos do cliente, sem corte de data: quem
        // decide o mês é a peça, não o dia do apontamento. Hora de alteração
        // lançada depois do virar do mês estava sumindo da carta.
        ids.length
          ? (supabase as any).from("time_entries")
              .select("deliverable_id, project_id, duration_min, alteracao_id, billable, start_at")
              .in("project_id", ids)
          : Promise.resolve({ data: [] }),
        (supabase as any).from("profiles").select("id, full_name, avatar_url"),
        // A tabela de preços do cliente — o "valor cadastrado" de cada tipo.
        // Vem daqui e não de dividir o preço cobrado pelo percentual: a peça
        // de brinde (0%) não teria como voltar ao valor de tabela por
        // aritmética, e uma divisão por zero numa folha de cobrança é o tipo
        // de erro que ninguém perdoa.
        (supabase as any).from("client_precos").select("tipo, preco, e_diaria, ordem")
          .eq("client_id", clientId).eq("ativo", true),
      ]);
      return {
        cliente: cli.data, fatura: fat.data,
        projetos: new Map<string, any>((proj.data || []).map((p: any) => [p.id, p])),
        entregas: ((ent.data || []) as any[]).filter((e: any) => pecasMensais.has(e.id)),
        // Peças cuja criação cai no mês — o recorte do fechamento.
        idsDoMes: new Set(((criacao.data || []) as any[]).map((r: any) => r.id)),
        alteracoes: (alt.data || []) as any[],
        demandas: (dem.data || []) as any[],
        diarias: (dia.data || []) as any[],
        // Hora presa a uma peça segue a peça; hora solta segue o projeto.
        // Mesmo par de regras da função de fechamento.
        horas: ((hrs.data || []) as any[]).filter(
          (t: any) => t.billable && (t.deliverable_id ? pecasMensais.has(t.deliverable_id) : projMensais.has(t.project_id)),
        ),
        pessoas: new Map<string, string>((prof.data || []).map((p: any) => [p.id, p.full_name])),
        precos: new Map<string, number>(
          ((precos.data || []) as any[]).map((r) => [String(r.tipo).toLowerCase(), Number(r.preco || 0)]),
        ),
      };
    },
  });

  const calc = useMemo(() => {
    if (!data) return null;
    const { entregas, alteracoes, demandas, horas } = data;
    const demPorProjeto = new Map<string, any>(demandas.filter((d: any) => d.projeto_id).map((d: any) => [d.projeto_id, d]));
    const idsEnt = new Set(entregas.map((e: any) => e.id));   // todas as peças do cliente

    // Alterações do período: seguem a PEÇA, não a data em que foram pedidas.
    //
    // Auditoria de julho/2026 (Sul Minas) achou TRÊS números pra isso na mesma
    // folha — 4 (alterações das peças do mês), 3 (pedidas no mês, qualquer
    // peça) e 2 (as duas coisas juntas). O resumo mostrava 3 e a tabela
    // listava 2, porque cada bloco aplicava o seu recorte.
    //
    // Vale a mesma régua das horas: alteração pedida em 05/08 numa peça de
    // julho é de julho — é lá que a hora dela é cobrada. E alteração pedida
    // em 30/07 numa peça de junho é de JUNHO, mesmo tendo sido pedida agora.
    //
    // O conjunto vem das PEÇAS DESTA CARTA, não de `idsDoMes` cru: aquele é o
    // índice de tudo que foi criado no mês NO SISTEMA INTEIRO — todos os
    // clientes. Usá-lo direto fez o resumo dizer "22 alterações" com 4
    // listadas: exatamente o mesmo defeito que esta mudança veio corrigir,
    // reintroduzido um passo adiante. O número do resumo tem que sair da
    // mesma lista que a tabela imprime, e é isso que a linha abaixo garante.
    // Peça reprovada ou cancelada não entra — a MESMA exclusão que a função
    // de fechamento faz. Sem ela, o dia em que alguém cancelar uma entrega a
    // carta lista uma linha que a nota não cobra, e a soma das linhas deixa
    // de bater com a fatura. Hoje não há nenhuma nesse estado em julho; a
    // regra existe pro dia em que houver.
    const doPeriodo = entregas.filter(
      (e: any) => data.idsDoMes.has(e.id) && !["reprovado", "cancelado"].includes(String(e.status || "")),
    );
    const altDoMes = alteracoesDoPeriodo(alteracoes as any[], doPeriodo as any[]);
    const altPorEnt = new Map<string, any[]>();
    for (const a of altDoMes) {
      if (!altPorEnt.has(a.deliverable_id)) altPorEnt.set(a.deliverable_id, []);
      altPorEnt.get(a.deliverable_id)!.push(a);
    }

    // Referência de "quando entrou" pra quem não veio de demanda: a data de
    // CRIAÇÃO do job — a mesma que define o mês. Era o primeiro apontamento
    // de hora, e por isso o ADVR-4288 saía com "~29/07" numa carta de julho
    // sendo de 12/06: a data mostrada contradizia o próprio período.
    const inicio = new Map<string, string>();
    for (const e of entregas) {
      const p = data.projetos.get(e.project_id);
      const criacao = p?.criado_em || p?.created_at || e.created_at;
      if (criacao) inicio.set(e.id, criacao);
    }

    // Horas por peça, separando edição de alteração.
    const hPorEnt = new Map<string, { edic: number; alt: number }>();
    for (const t of horas) {
      if (!t.deliverable_id) continue;
      const cur = hPorEnt.get(t.deliverable_id) || { edic: 0, alt: 0 };
      if (t.alteracao_id) cur.alt += t.duration_min || 0;
      else cur.edic += t.duration_min || 0;
      hPorEnt.set(t.deliverable_id, cur);
    }

    // (doPeriodo definido acima: peça entra quando FOI CRIADA no período — o
    // mesmo recorte da fatura.)
    // O que foi cobrado por peça sai da FATURA, não de um cálculo próprio
    // desta tela. A fatura é o documento; a carta explica o documento. Se a
    // carta recalculasse o preço, um dia os dois divergiriam e o cliente
    // teria em mãos duas contas nossas que não fecham.
    const itensFatura: any[] = (data.fatura?.detalhe?.itens || []) as any[];
    const cobradoPorPeca = new Map<string, any>(
      itensFatura.filter((i) => i.deliverable_id).map((i) => [i.deliverable_id, i]),
    );

    const linhas: any[] = doPeriodo.map((e: any) => {
      const dem = demPorProjeto.get(e.project_id);
      const h = hPorEnt.get(e.id) || { edic: 0, alt: 0 };
      return {
        ...e,
        ...cobrancaDaPeca(e, cobradoPorPeca, data.precos),
        projeto: data.projetos.get(e.project_id)?.name || "",
        // Data de SOLICITAÇÃO: a da demanda quando o pedido entrou pelo
        // formulário; senão a data em que a peça foi criada no sistema, que
        // é o mais perto disso que existe.
        // Só a demanda é fonte de "quando pediram". Sem ela, mostramos o
        // início do trabalho, marcado como aproximado — melhor um dado
        // honesto e rotulado do que uma data errada com cara de certa.
        solicitadoEm: dem?.created_at || null,
        inicioEm: inicio.get(e.id) || null,
        veioDeDemanda: !!dem,
        // Prioriza o que está NA PEÇA: a demanda diz quem abriu o projeto,
        // a peça diz quem pediu aquele material — quando são pessoas
        // diferentes, é a segunda que responde a dúvida do fechamento.
        solicitante: e.solicitado_por || dem?.solicitante_nome || null,
        alteracoes: altPorEnt.get(e.id) || [],
        minEdic: h.edic, minAlt: h.alt,
      };
    }).sort((a: any, b: any) => dataDaLinha(a).localeCompare(dataDaLinha(b)));

    const porTipo = new Map<string, { n: number; meias: number }>();
    for (const l of linhas) {
      const t = l.tipo_cobranca || "sem tipo";
      const cur = porTipo.get(t) || { n: 0, meias: 0 };
      cur.n += 1;
      if (Number(l.cobranca_percent ?? 100) !== 100) cur.meias += 1;
      porTipo.set(t, cur);
    }

    const ranking = (campo: (l: any) => string | null, peso: (l: any) => number) => {
      const m = new Map<string, number>();
      for (const l of linhas) {
        const k = campo(l);
        if (!k) continue;
        m.set(k, (m.get(k) || 0) + peso(l));
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    // Hora lançada no projeto sem peça vinculada: aparece como uma linha
    // própria em vez de sumir. O fechamento cobra, a carta mostra. Sem peça,
    // quem dá o mês é a criação do PROJETO — mesma regra da função.
    const minSemPeca = horas
      .filter((t: any) => {
        if (t.deliverable_id) return false;
        const p = data.projetos.get(t.project_id);
        const criacao = p?.criado_em || p?.created_at || "";
        return criacao >= ref && criacao < fim;
      })
      .reduce((s: number, t: any) => s + (t.duration_min || 0), 0);

    // Quantas peças o cliente recebeu no período. É a primeira pergunta que
    // ele faz ao abrir a carta ("quantos vídeos vocês fizeram?"), e o resumo
    // só respondia com horas — que é a nossa unidade, não a dele.
    const totalPecas = linhas.length;
    const pecasEntregues = contarEntregues(linhas as any[]);

    // Agrupado por quem pediu. As linhas já vêm ordenadas por data, então
    // cada grupo herda a ordem cronológica sem ordenar de novo; os grupos
    // saem na ordem do primeiro pedido de cada pessoa. "Sem solicitante" vai
    // pro fim: é o resto, e o rodapé da carta já explica o que ele é.
    const grupos = new Map<string, any[]>();
    for (const l of linhas) {
      const k = l.solicitante || SEM_SOLICITANTE;
      const g = grupos.get(k);
      if (g) g.push(l); else grupos.set(k, [l]);
    }
    const somaValor = (arr: any[]) => arr.reduce((s: number, l: any) => s + Number(l.valorCobrado || 0), 0);
    const porSolicitante = [...grupos.entries()]
      .map(([nome, itens]) => ({ nome, itens, valor: somaValor(itens) }))
      .sort((a, b) => (a.nome === SEM_SOLICITANTE ? 1 : b.nome === SEM_SOLICITANTE ? -1 : 0));

    // Conferência que NÃO vai pro cliente (fica em bloco `no-print`): as
    // linhas impressas têm que somar o mesmo que os itens da fatura. Divergem
    // quando o rascunho está velho — peça criada depois da última geração
    // sairia na carta sem preço, e o total mentiria por omissão.
    const { totalEntregas, totalItensFatura, semPreco, confere } = conferePrecos(linhas, itensFatura);

    return {
      linhas, porSolicitante, porTipo, minSemPeca,
      totalEntregas, totalItensFatura, semPreco, confere,
      totalPecas, pecasEntregues,
      totalAlt: altDoMes.length,
      minEdic: linhas.reduce((s: number, l: any) => s + l.minEdic, 0) + minSemPeca,
      minAlt: linhas.reduce((s: number, l: any) => s + l.minAlt, 0),
      quemSolicita: ranking((l) => l.solicitante, () => 1),
      // As alterações do período, uma a uma — em vez de um ranking de pessoa.
      //
      // O ranking anterior atribuía cada alteração ao SOLICITANTE DA PEÇA, e
      // saía impresso como "quem mais pediu alteração". Na base real, quem
      // registra a alteração é a nossa equipe (criacao@adverse.rec.br,
      // djeisson@…, "ClickUp") — não existe o dado "qual pessoa do cliente
      // pediu". A carta estava dizendo ao cliente que gente dele pediu
      // retrabalho que talvez não tenha pedido. Num documento de cobrança,
      // esse é o pior erro possível.
      alteracoesLista: linhas.flatMap((l: any) =>
        (l.alteracoes || []).map((a: any) => ({ peca: l.codigo || l.titulo, titulo: a.titulo }))),
      semSolicitante: linhas.filter((l: any) => !l.solicitante).length,
    };
  }, [data, ref, fim]);

  /**
   * O Chrome usa o `document.title` como nome do arquivo ao "Salvar como PDF".
   * Sem isto o cliente recebe "os.adverse.rec.br.pdf" — e o Djêisson teria que
   * renomear à mão toda vez, na hora de anexar no e-mail.
   *
   * Hook ANTES dos early returns: o número de hooks não pode variar entre o
   * render de carregamento e o de conteúdo (React #310).
   */
  const nomeCliente = data?.cliente?.name || "";
  useEffect(() => {
    if (!nomeCliente || !mes) return;
    const anterior = document.title;
    const [aa, mm] = mes.split("-");
    document.title = `Fechamento ${mm}-${aa} — ${nomeCliente}`;
    return () => { document.title = anterior; };
  }, [nomeCliente, mes]);

  if (isLoading || !data || !calc) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const modelo = data.fatura?.modelo || "tabela";
  const emissao = new Date();
  const venc = new Date(emissao.getTime() + 7 * 86400000);
  const fmtD = (d: Date) => d.toLocaleDateString("pt-BR");
  const periodo = new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const ultimoDia = new Date(ano, m, 0).getDate();
  const diariasQtd = Number(data.fatura?.detalhe?.diarias_qtd || 0);
  const diariasAbatidas = Number(data.fatura?.detalhe?.diarias_saldo_abatido || 0);
  const diariasCobradas = Number(data.fatura?.detalhe?.diarias_cobradas || 0);
  const diariaUnitario = Number(data.fatura?.detalhe?.diarias_valor_unitario || 0);

  const custoLogistica = data.diarias.reduce(
    (s: number, d: any) => s + Number(d.custo_logistica || 0) + Number(d.custo_alimentacao || 0) + Number(d.custo_hospedagem || 0), 0);

  return (
    <>
      {/* A moldura do app (menu, cabeçalho, botões flutuantes) sai pelo bloco
          `@media print` global do index.css. Aqui fica só o que é DESTE
          documento: como ele se parte entre páginas. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }

          /* Fundo branco e texto preto de verdade — a folha é renderizada com
             as cores do tema em tela, e cinza sobre cinza não se lê no papel. */
          .folha { color: #111 !important; background: #fff !important;
                   max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .folha * { color: inherit !important; border-color: #ddd !important; }
          .folha .destaque { color: #111 !important; }

          /* --------------------------------------------- quebra de página
             O documento vai pro cliente: linha partida ao meio, cabeçalho de
             seção sozinho no pé da página e total separado do vencimento são
             erros que a gente não vê na tela e o cliente vê no PDF. */

          /* Título de seção nunca fica órfão no fim da página. */
          .folha .secao > p:first-child { break-after: avoid; }

          /* Linha da tabela é indivisível, e o cabeçalho se repete. */
          .folha tr { break-inside: avoid; }
          .folha thead { display: table-header-group; }

          /* Blocos curtos (resumo, rankings, total) não se partem. */
          .folha .bloco-inteiro { break-inside: avoid; }

          /* O rodapé de valor anda junto com o que vem antes dele. */
          .folha .rodape-valor { break-inside: avoid; break-before: auto; }

          /* Cabeçalho do documento não se separa do período. */
          .folha .cabecalho { break-after: avoid; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span className="text-xs text-muted-foreground">
          Relatório de {data.cliente?.name} · {periodo}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir / Salvar PDF
        </Button>
      </div>

      <div className="folha mx-auto max-w-4xl bg-white p-10 text-[#111]">
        {/* Cabeçalho: quem manda, pra quem, e de que período. */}
        <div className="cabecalho flex items-start justify-between gap-6 border-b border-[#ddd] pb-5">
          <div>
            <p className="text-xl font-bold tracking-tight">{PRODUTORA.wordmark}</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">{PRODUTORA.descricao}</p>
          </div>
          <div className="text-right text-xs leading-relaxed text-[#555]">
            <p className="text-sm font-semibold text-[#111]">{data.cliente?.name}</p>
            {data.cliente?.contact_name && <p>A/C {data.cliente.contact_name}</p>}
            <p className="mt-1">Emitido em {fmtD(emissao)}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">Fechamento do período</p>
          <h1 className="text-2xl font-bold capitalize tracking-tight">{periodo}</h1>
          <p className="mt-1 text-xs text-[#555]">
            Apuração de 01/{String(m).padStart(2, "0")}/{ano} a {ultimoDia}/{String(m).padStart(2, "0")}/{ano}
          </p>
        </div>

        {/* ---------- TABELA: o cliente compra peças ---------- */}
        {modelo === "tabela" && (
          <>
            <Secao titulo="Entregas do período">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#ddd] text-left text-[10px] uppercase tracking-wider text-[#888]">
                    <th className="py-1.5 font-medium">Cód.</th>
                    <th className="py-1.5 font-medium">Entrega</th>
                    <th className="py-1.5 font-medium">Solicitado</th>
                    <th className="py-1.5 font-medium">Tipo</th>
                    <th className="py-1.5 text-right font-medium">Tabela</th>
                    <th className="py-1.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                {/* Agrupado por quem pediu, e por data dentro do grupo.
                    A coluna "Por" some daqui: virou o cabeçalho do grupo, e
                    repetir o mesmo nome em oito linhas seguidas era a coluna
                    mais redundante da folha. */}
                {calc.porSolicitante.map((g: any, gi: number) => (
                  <tbody key={g.nome}>
                    {/* `breakAfter: avoid` pra o nome do solicitante não ficar
                        sozinho no pé de uma página, com as entregas dele na
                        seguinte. */}
                    <tr style={{ breakAfter: "avoid" }}>
                      <td colSpan={4} className={`pb-2 ${gi === 0 ? "pt-2" : "pt-6"}`}>
                        {/* Retângulo, não texto solto: quem lê a folha procura
                            o próprio nome antes de olhar as entregas, e uma
                            linha em maiúsculas cinza se perdia no meio de
                            trinta linhas de tabela. */}
                        <span className="inline-block rounded border border-[#111] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#111]">
                          {g.nome}
                        </span>
                        <span className="ml-2 text-[10px] text-[#888]">
                          {g.itens.length} {g.itens.length === 1 ? "entrega" : "entregas"}
                        </span>
                      </td>
                      <td colSpan={2} className={`pb-2 text-right ${gi === 0 ? "pt-2" : "pt-6"}`}>
                        {g.valor > 0 && (
                          <span className="tabular-nums text-[11px] font-semibold">{formatCurrency(g.valor)}</span>
                        )}
                      </td>
                    </tr>
                    {g.itens.map((l: any) => (
                      <tr key={l.id} className="border-b border-[#f0f0f0]">
                        <td className="py-1.5 pr-3 font-mono text-[10px] text-[#888]">{l.codigo || "—"}</td>
                        <td className="py-1.5 pr-3">{l.titulo}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-[#555]"><CelulaSolicitado linha={l} /></td>
                        <td className="py-1.5 pr-3">
                          {l.tipoCobrado || "—"}
                          {l.percentCobrado !== 100 && (
                            <span className="text-[#888]"> · {l.percentCobrado}%</span>
                          )}
                        </td>
                        {/* Tabela ao lado do valor: um terço das entregas sai
                            pela metade, e sem o preço cheio à vista a linha
                            "Pílula · R$ 223,30" só levanta a pergunta de por
                            que não são R$ 446,60. Com os dois, a folha se
                            explica sozinha. */}
                        <td className="py-1.5 pr-3 text-right tabular-nums text-[#888]">
                          {l.valorTabela != null ? formatCurrency(l.valorTabela) : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium">
                          {l.valorCobrado != null ? formatCurrency(l.valorCobrado) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <td colSpan={4} className="pt-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                      Total das entregas
                    </td>
                    <td />
                    <td className="border-t-2 border-[#111] pt-2 text-right tabular-nums text-sm font-bold">
                      {formatCurrency(calc.totalEntregas)}
                    </td>
                  </tr>
                  {custoLogistica + Number(data.fatura?.detalhe?.diarias_valor || 0) > 0 && (
                    <tr>
                      <td colSpan={6} className="pt-1 text-right text-[10px] text-[#888]">
                        As diárias de gravação estão detalhadas abaixo e somam à parte.
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>

              {/* SÓ NA TELA. Se o rascunho do fechamento estiver velho, uma
                  peça criada depois sai sem preço e o total mente por omissão
                  — o Djêisson precisa ver isso antes de mandar, e o cliente
                  nunca. */}
              {!calc.confere && (
                <div className="no-print mt-3 rounded border border-red-400 bg-red-50 p-2 text-[11px] text-red-700">
                  <b>Confira antes de enviar.</b>{" "}
                  {calc.semPreco > 0
                    ? `${calc.semPreco} entrega(s) desta carta não têm preço na fatura — provavelmente entraram depois da última geração do rascunho.`
                    : `A soma das linhas (${formatCurrency(calc.totalEntregas)}) difere dos itens da fatura (${formatCurrency(calc.totalItensFatura)}).`}{" "}
                  Regere o rascunho em Faturamento e recarregue esta página.
                </div>
              )}
            </Secao>

            <Secao titulo="Resumo por tipo" inteira>
              {/* O total antes da quebra por tipo: no modelo tabela a lista
                  por tipo já existia, mas obrigava o cliente a somar de
                  cabeça pra saber quantas peças recebeu no mês. */}
              <div className="mb-3 flex items-baseline gap-2 border-b border-[#ddd] pb-2">
                <span className="text-2xl font-bold tabular-nums">{calc.totalPecas}</span>
                <span className="text-xs text-[#555]">
                  {calc.totalPecas === 1 ? "entrega no período" : "entregas no período"}
                  {calc.pecasEntregues < calc.totalPecas &&
                    ` · ${calc.pecasEntregues} concluídas, ${calc.totalPecas - calc.pecasEntregues} em andamento`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-3">
                {[...calc.porTipo.entries()].map(([tipo, v]) => (
                  <div key={tipo} className="flex justify-between border-b border-[#f0f0f0] py-1">
                    <span>{tipo}</span>
                    <span className="tabular-nums font-medium">
                      {v.n}{v.meias > 0 && <span className="text-[#888]"> ({v.meias} pela metade)</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#555]">
                <b>{calc.totalAlt}</b> {calc.totalAlt === 1 ? "alteração solicitada" : "alterações solicitadas"} no período —
                sem custo adicional, informado para acompanhamento.
              </p>
            </Secao>
          </>
        )}

        {/* ---------- HORAS: o cliente compra tempo ---------- */}
        {modelo === "horas" && (
          <>
            <Secao titulo="Entregas e horas do período">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#ddd] text-left text-[10px] uppercase tracking-wider text-[#888]">
                    <th className="py-1.5 font-medium">Cód.</th>
                    <th className="py-1.5 font-medium">Entregável</th>
                    <th className="py-1.5 font-medium">Solicitado</th>
                    <th className="py-1.5 font-medium">Por</th>
                    <th className="py-1.5 text-right font-medium">Edição</th>
                    <th className="py-1.5 text-right font-medium">Alterações</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.linhas.map((l: any) => (
                    <tr key={l.id} className="border-b border-[#f0f0f0]">
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-[#888]">{l.codigo || "—"}</td>
                      <td className="py-1.5 pr-3">{l.titulo}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-[#555]"><CelulaSolicitado linha={l} /></td>
                      <td className="py-1.5 pr-3 text-[#555]">{l.solicitante || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{l.minEdic > 0 ? fmtDuracao(l.minEdic) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {l.alteracoes.length > 0
                          ? `${l.alteracoes.length}× · ${l.minAlt > 0 ? fmtDuracao(l.minAlt) : "—"}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {calc.minSemPeca > 0 && (
                    <tr className="border-b border-[#f0f0f0] text-[#555]">
                      <td className="py-1.5 pr-3">—</td>
                      <td className="py-1.5 pr-3 italic">Horas de projeto sem peça específica</td>
                      <td className="py-1.5 pr-3">—</td>
                      <td className="py-1.5 pr-3">—</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtDuracao(calc.minSemPeca)}</td>
                      <td className="py-1.5 text-right">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Secao>

            <Secao titulo="Resumo do período" inteira>
              <div className="grid grid-cols-4 gap-6 text-xs">
                {/* Entregas primeiro: é o que o cliente conta. Horas é como a
                    gente cobra, e vem depois. */}
                <Kpi
                  rot="Entregas"
                  v={String(calc.totalPecas)}
                  nota={
                    calc.pecasEntregues < calc.totalPecas
                      ? `${calc.pecasEntregues} entregues · ${calc.totalPecas - calc.pecasEntregues} em andamento`
                      : undefined
                  }
                />
                <Kpi rot="Horas de edição" v={fmtDuracao(calc.minEdic)} />
                <Kpi rot="Horas de alteração" v={fmtDuracao(calc.minAlt)} />
                <Kpi rot="Alterações pedidas" v={String(calc.totalAlt)} />
              </div>
              {(calc.quemSolicita.length > 0 || calc.alteracoesLista.length > 0) && (
                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  {calc.quemSolicita.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#888]">Quem mais solicitou</p>
                      {calc.quemSolicita.slice(0, 5).map(([q, n]) => (
                        <div key={q} className="flex justify-between border-b border-[#f0f0f0] py-1 text-xs">
                          <span>{q}</span><span className="tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {calc.alteracoesLista.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#888]">Alterações do período</p>
                      {calc.alteracoesLista.slice(0, 8).map((a: any, i: number) => (
                        <div key={i} className="flex justify-between gap-3 border-b border-[#f0f0f0] py-1 text-xs">
                          <span className="min-w-0 truncate">{a.titulo}</span>
                          <span className="shrink-0 font-mono text-[10px] text-[#888]">{a.peca}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Secao>
          </>
        )}

        {/* Diárias: valem pros dois formatos quando existem. */}
        {data.diarias.length > 0 && (
          <Secao titulo="Diárias de gravação" inteira>
            <div className="space-y-1 text-xs">
              {data.diarias.map((d: any) => (
                <div key={d.data} className="flex justify-between gap-3 border-b border-[#f0f0f0] py-1">
                  <span className="min-w-0">
                    {fmtISO(d.data)}
                    {Number(d.fracao) < 1 && <span className="text-[#888]"> · meia diária</span>}
                    {d.projetos > 1 && <span className="text-[#888]"> · {d.projetos} projetos no mesmo dia</span>}
                  </span>
                  {/* O valor de CADA dia, pelo preço cheio de tabela. O que o
                      saldo abate aparece na conta logo abaixo, não aqui: se o
                      abatimento entrasse por dia, a soma da lista não bateria
                      com nenhum dos dois números da caixa. */}
                  <span className="shrink-0 tabular-nums">
                    {String(d.fracao).replace(".", ",")}
                    {diariaUnitario > 0 && (
                      <span className="ml-2 text-[#555]">{formatCurrency(Number(d.fracao) * diariaUnitario)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {/* Duas parcelas na carta também: o dia é serviço, os custos do
                dia são repasse. Somar os dois numa linha só faria o cliente
                perguntar de onde veio o número. */}
            <div className="mt-2 space-y-0.5 text-xs">
              {/* Quando há saldo abatido, a conta das diárias abre.
                  Antes o abatimento era um parêntese cinza no meio da linha de
                  valor — a parte que o cliente NÃO paga era a que menos
                  aparecia, e meia diária virava um "1,5" sem explicação. As
                  três linhas fecham por construção: na função de fechamento
                  `abatidas = LEAST(saldo, qtd)` e `cobradas = qtd - saldo`,
                  as duas derivadas do mesmo `qtd` que soma os dias listados
                  acima — não há como a caixa discordar da lista. */}
              {diariasAbatidas > 0 ? (
                <div className="rounded border border-[#ddd] px-3 py-2">
                  <p className="flex justify-between">
                    <span className="text-[#555]">Diárias realizadas no período</span>
                    <span className="tabular-nums">{qtdBR(diariasQtd)}</span>
                  </p>
                  <p className="mt-1 flex justify-between font-semibold">
                    <span>Abatidas do saldo do cliente</span>
                    <span className="tabular-nums">−{qtdBR(diariasAbatidas)}</span>
                  </p>
                  <p className="mt-1 flex justify-between border-t border-[#ddd] pt-1">
                    <span className="text-[#555]">
                      A cobrar · {qtdBR(diariasCobradas)} ×{" "}
                      {formatCurrency(Number(data.fatura?.detalhe?.diarias_valor_unitario || 0))}
                    </span>
                    <b className="tabular-nums">{formatCurrency(Number(data.fatura?.detalhe?.diarias_valor || 0))}</b>
                  </p>
                  <p className="mt-1.5 text-[10px] text-[#888]">
                    {qtdBR(diariasAbatidas)} diária(s) saíram do saldo já contratado e não são cobradas neste fechamento.
                  </p>
                </div>
              ) : (
                Number(data.fatura?.detalhe?.diarias_valor || 0) > 0 && (
                  <p className="flex justify-between">
                    <span>
                      {qtdBR(diariasCobradas)} diária(s) ×{" "}
                      {formatCurrency(Number(data.fatura.detalhe.diarias_valor_unitario || 0))}
                    </span>
                    <b className="tabular-nums">{formatCurrency(Number(data.fatura.detalhe.diarias_valor))}</b>
                  </p>
                )
              )}
              {custoLogistica > 0 && (
                <p className="flex justify-between">
                  <span>Logística, alimentação e hospedagem</span>
                  <b className="tabular-nums">
                    {formatCurrency(Number(data.fatura?.detalhe?.diarias_repasse || custoLogistica))}
                  </b>
                </p>
              )}
            </div>
          </Secao>
        )}

        {/* Valor e prazo — o motivo do documento. Nunca se parte: vencimento
            numa página e total na outra é o pior lugar pra quebrar. */}
        <div className="rodape-valor mt-8 border-t-2 border-[#111] pt-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="text-xs text-[#555]">
              <p>Vencimento: <b className="text-[#111]">{fmtD(venc)}</b></p>
              <p className="mt-0.5">7 dias corridos a partir da emissão.</p>
              {Number(data.fatura?.detalhe?.saldo?.usado || 0) > 0 && (
                <p className="mt-1.5">
                  Saldo abatido: <b className="text-[#111]">{formatCurrency(Number(data.fatura.detalhe.saldo.usado))}</b>
                  {Number(data.fatura.detalhe.saldo.sobra) > 0 &&
                    ` · restam ${formatCurrency(Number(data.fatura.detalhe.saldo.sobra))} para o próximo período`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#888]">Total do período</p>
              <p className="destaque text-3xl font-bold tracking-tight">
                {formatCurrency(Number(data.fatura?.total || 0))}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-[#999]">
          {PRODUTORA.nome} · {PRODUTORA.site} · {PRODUTORA.email}
        </p>
      </div>

      {calc.semSolicitante > 0 && (
        <p className="no-print mx-auto max-w-4xl px-10 py-4 text-xs text-muted-foreground">
          {calc.semSolicitante} de {calc.linhas.length} entregas estão sem solicitante: elas não vieram
          pelo formulário de demandas. Nesses casos a coluna “Solicitado” mostra{" "}
          <b>~a data em que o trabalho começou</b> (primeira hora lançada), não a data do pedido — o
          til está lá pra dizer isso. Antes aparecia a data de cadastro da peça, que nas importadas do
          ClickUp é o dia da importação: todas iguais.
        </p>
      )}
    </>
  );
}

function Secao({ titulo, children, inteira }: {
  titulo: string; children: React.ReactNode;
  /** Bloco curto: prefere ir inteiro pra próxima página a se partir. */
  inteira?: boolean;
}) {
  return (
    // `secao` existe pro CSS de impressão: o título não pode ficar sozinho no
    // pé da página, separado do conteúdo que ele nomeia.
    <div className={`secao mt-7 ${inteira ? "bloco-inteiro" : ""}`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#888]">{titulo}</p>
      {children}
    </div>
  );
}

function Kpi({ rot, v, nota }: { rot: string; v: string; nota?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#888]">{rot}</p>
      <p className="text-lg font-semibold tabular-nums">{v}</p>
      {/* Só aparece quando há o que ressalvar — número redondo não precisa de
          nota, e nota vazia vira ruído numa carta que vai pro cliente. */}
      {nota && <p className="text-[10px] text-[#888]">{nota}</p>}
    </div>
  );
}

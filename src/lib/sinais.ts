// ───────────────────────────────────────────────────────────────────────────
// Motor de sinais do dashboard ("O que olhar agora").
//
// REGRA DE OURO: esta função é PURA e recebe os valores JÁ COMPUTADOS e
// auditados (margemLiquida, runway, aReceberVencido, topClientes...). Ela NUNCA
// recalcula nada a partir dos itens crus do Conta Azul — senão o painel poderia
// contradizer o drill-down e quebrar a reconciliação 100% com o CA. Cada sinal
// aponta pro mesmo número que a seção/drill-down já mostra.
//
// Saída: lista priorizada (atenção crítica → ... → oportunidade), deduplicada
// por tema e recortada no topo, pra nunca virar mural de alertas.
// ───────────────────────────────────────────────────────────────────────────

export type SinalTipo = "oportunidade" | "atencao";
export type Severidade = "critico" | "alerta" | "leve" | "destaque" | "normal";
export type Urgencia = "hoje" | "até 30 dias" | "estrutural" | "comercial";
export type Regime = "competência" | "caixa";

export interface SinalAcao {
  texto: string;
  rota?: string;
  modal?: string; // chave que a Home mapeia pro DetailModal com os itens certos
}

export interface Sinal {
  id: string;
  tipo: SinalTipo;
  severidade: Severidade;
  urgencia?: Urgencia;
  tema: string; // dedup: 1 sinal por tema (mantém o de maior severidade)
  titulo: string; // frase de ação/comemoração, não termo contábil
  frase: string; // 1 frase de contexto em linguagem natural
  prova: string; // o número que importa
  regime?: Regime;
  peso: number; // desempate dentro da mesma severidade (impacto/urgência em R$)
  acao?: SinalAcao;
}

export interface SinaisInput {
  fmtMoeda: (n: number) => string;
  fmtPct: (n: number) => string;
  // ---- valores já computados (auditados) ----
  margemLiquidaPct: number;
  margemLiquidaValor: number;
  metaMargem: number | null;
  faturamentoMes: number;
  faturamentoVsMeta: number;
  monthlyTarget: number;
  runway: number; // pode ser Infinity
  burnRate: number;
  saldoConta: number;
  aReceberMes: number;
  aReceberMesVencido: number;
  aPagarMesAberto: number;
  abertoImpostos: number;
  fixPctReceita: number;
  custosFixos: number;
  geracaoCaixa: number;
  geracaoMensalValores: number[]; // os 6 meses fechados (caixa)
  trailingMargemLiquidaPct: number;
  trailingMargemCaixaPct: number;
  faltaPraLucro: number;
  mrr: number;
  retiradaSocios: number;
  concentracaoTop3: number;
  entradas30dTotal: number;
  entradas30dTop: { cliente: string; valor: number } | null;
  clientes: { nome: string; proj: number; fat: number; ticket: number }[];
  ticketMedio: number;
}

const RANK: Record<Severidade, number> = { critico: 0, alerta: 1, destaque: 2, leve: 3, normal: 4 };

const fmtRunway = (r: number) => (r === Infinity ? "∞" : `${r.toFixed(1)} meses`);

export function gerarSinais(i: SinaisInput, limite = 6): Sinal[] {
  const m = i.fmtMoeda;
  const p = i.fmtPct;
  const out: Sinal[] = [];
  const temFaturamento = i.faturamentoMes > 0;
  const caixaCritico = i.runway !== Infinity && i.runway < 2;

  // ═══════════════ ATENÇÃO ═══════════════

  // Runway — sobrevivência: sempre no topo dos críticos (peso alto).
  if (i.runway !== Infinity && i.runway < 4) {
    const crit = i.runway < 2;
    out.push({
      id: "atn_runway", tipo: "atencao", severidade: crit ? "critico" : "alerta", urgencia: "estrutural", tema: "caixa",
      titulo: crit ? `Reforce o caixa — dura ${i.runway.toFixed(1)} meses` : `Caixa apertado — ${i.runway.toFixed(1)} meses`,
      frase: `No ritmo de saída atual (${m(i.burnRate)}/mês), o dinheiro em conta cobre ${fmtRunway(i.runway)}.${crit ? " Abaixo de 2 acende o vermelho — priorize cobrança." : " Vale reforçar antes que aperte."}`,
      prova: `runway ${i.runway.toFixed(1)}m`, regime: "caixa", peso: 1_000_000_000 + i.saldoConta,
      acao: { texto: "ver projeção", rota: "/financeiro/runway" },
    });
  }

  // Total a pagar em aberto maior que o saldo.
  if (i.aPagarMesAberto > i.saldoConta * 0.8) {
    const crit = i.aPagarMesAberto > i.saldoConta;
    out.push({
      id: "atn_pagar_saldo", tipo: "atencao", severidade: crit ? "critico" : "alerta", urgencia: "estrutural", tema: "caixa-pagar",
      titulo: crit ? "Contas a pagar passam do caixa" : "Contas a pagar quase no limite do caixa",
      frase: `${m(i.aPagarMesAberto)} ainda a pagar no período contra ${m(i.saldoConta)} em conta. Cruze com o que entra no prazo e priorize a cobrança.`,
      prova: `${m(i.aPagarMesAberto)} a pagar`, regime: "caixa", peso: 900_000_000 + i.aPagarMesAberto,
      acao: { texto: "ver caixa", rota: "/financeiro/runway" },
    });
  }

  // Margem líquida negativa no período.
  if (i.margemLiquidaPct < 0) {
    const crit = i.margemLiquidaPct < -3;
    out.push({
      id: "atn_margem_neg", tipo: "atencao", severidade: crit ? "critico" : "alerta", urgencia: "estrutural", tema: "resultado",
      titulo: "Ajuste preço ou estrutura",
      frase: `Resultado de ${m(i.margemLiquidaValor)} no período (${p(i.margemLiquidaPct)}). No papel a operação gastou mais do que faturou${i.faltaPraLucro > 0 ? ` — faltam ${m(i.faltaPraLucro)} de faturamento pra zerar` : ""}.`,
      prova: `margem ${p(i.margemLiquidaPct)}`, regime: "competência", peso: 800_000_000 + Math.abs(i.margemLiquidaValor),
      acao: { texto: "ver resultado", rota: "/financeiro/resultados" },
    });
  }

  // A receber vencido (inadimplência).
  if (i.aReceberMesVencido >= 10000) {
    const crit = i.aReceberMesVencido >= 30000 || (i.aReceberMes > 0 && i.aReceberMesVencido >= i.aReceberMes * 0.25);
    const pctVenc = i.aReceberMes > 0 ? (i.aReceberMesVencido / i.aReceberMes) * 100 : 0;
    out.push({
      id: "atn_vencido", tipo: "atencao", severidade: crit ? "critico" : "alerta", urgencia: "hoje", tema: "vencido",
      titulo: "Cobre o que já venceu",
      frase: `${m(i.aReceberMesVencido)} já venceram e não entraram${pctVenc > 0 ? ` — ${pctVenc.toFixed(0)}% do que você tem a receber` : ""}. Esse dinheiro pode salvar o runway.`,
      prova: `${m(i.aReceberMesVencido)} vencido`, regime: "caixa", peso: 700_000_000 + i.aReceberMesVencido,
      acao: { texto: "ver faturas", modal: "vencido" },
    });
  }

  // Geração de caixa negativa (estrutural se recorrente).
  if (i.geracaoCaixa < 0) {
    const negMeses = i.geracaoMensalValores.filter((v) => v < 0).length;
    const crit = negMeses >= 3;
    out.push({
      id: "atn_geracao_neg", tipo: "atencao", severidade: crit ? "critico" : "alerta", urgencia: "estrutural", tema: "geracao",
      titulo: "Saiu mais do que entrou",
      frase: `Saíram ${m(Math.abs(i.geracaoCaixa))} a mais do que entraram no período.${crit ? ` ${negMeses} dos últimos 6 meses também fecharam no negativo — é padrão, não acidente.` : ""}`,
      prova: `${m(i.geracaoCaixa)} no caixa`, regime: "caixa", peso: 600_000_000 + Math.abs(i.geracaoCaixa),
      acao: { texto: "ver caixa", rota: "/financeiro/runway" },
    });
  }

  // Concentração de clientes.
  if (i.concentracaoTop3 > 50) {
    const crit = i.concentracaoTop3 > 70;
    out.push({
      id: "atn_concentracao", tipo: "atencao", severidade: crit ? "critico" : "alerta", urgencia: "estrutural", tema: "concentracao",
      titulo: "Diversifique a carteira",
      frase: `Os 3 maiores clientes somam ${i.concentracaoTop3.toFixed(0)}% do faturamento do período. Se um sair, abre um buraco grande na receita.`,
      prova: `top 3 = ${i.concentracaoTop3.toFixed(0)}%`, regime: "competência", peso: i.faturamentoMes * (i.concentracaoTop3 / 100),
      acao: { texto: "ver clientes", rota: "/clientes" },
    });
  }

  // Custo fixo pesado sobre a receita.
  if (temFaturamento && i.fixPctReceita > 35) {
    const alta = i.fixPctReceita > 45;
    out.push({
      id: "atn_fixo_alto", tipo: "atencao", severidade: alta ? "alerta" : "leve", urgencia: "estrutural", tema: "estrutura-custo",
      titulo: "Estrutura pesada pro faturamento",
      frase: `Custos fixos consomem ${i.fixPctReceita.toFixed(0)}% do faturamento (${m(i.custosFixos)} de ${m(i.faturamentoMes)}). Veja se a receita comporta ou se há gordura.`,
      prova: `fixos ${i.fixPctReceita.toFixed(0)}% da receita`, regime: "competência", peso: i.custosFixos,
      acao: { texto: "ver custos", modal: "custosFixos" },
    });
  }

  // Gap competência × caixa (lucra no papel, demora a receber).
  if (i.trailingMargemLiquidaPct > 0 && i.trailingMargemLiquidaPct - i.trailingMargemCaixaPct >= 10) {
    out.push({
      id: "atn_timing", tipo: "atencao", severidade: "alerta", urgencia: "estrutural", tema: "timing",
      titulo: "Você fatura, mas demora a receber",
      frase: `No papel a margem é ${p(i.trailingMargemLiquidaPct)}, mas no caixa só ${p(i.trailingMargemCaixaPct)}. Encurtar prazos e apertar a cobrança fecha esse gap.`,
      prova: `${(i.trailingMargemLiquidaPct - i.trailingMargemCaixaPct).toFixed(0)} pts de diferença`, regime: "caixa", peso: 50000,
      acao: { texto: "ver tendência", rota: "/financeiro/resultados" },
    });
  }

  // Impostos do período em aberto.
  if (i.abertoImpostos > 0) {
    const crit = i.saldoConta > 0 && i.abertoImpostos > i.saldoConta * 0.3;
    out.push({
      id: "atn_impostos", tipo: "atencao", severidade: crit ? "alerta" : "leve", urgencia: "até 30 dias", tema: "impostos",
      titulo: "Reserve os impostos a pagar",
      frase: `${m(i.abertoImpostos)} de impostos do período ainda em aberto. Saída certa que ainda não saiu do caixa — separe o valor.`,
      prova: `${m(i.abertoImpostos)} em aberto`, regime: "caixa", peso: i.abertoImpostos,
      acao: { texto: "ver impostos", modal: "impostos" },
    });
  }

  // Faturamento abaixo da meta.
  if (i.monthlyTarget > 0 && i.faturamentoVsMeta < 85) {
    const baixo = i.faturamentoVsMeta < 60;
    out.push({
      id: "atn_fat_meta", tipo: "atencao", severidade: baixo ? "alerta" : "leve", urgencia: "comercial", tema: "comercial",
      titulo: "Acelere o comercial",
      frase: `Faturamento em ${p(i.faturamentoVsMeta)} da meta do período (${m(i.faturamentoMes)}). Ritmo comercial abaixo do necessário — empurre o pipeline.`,
      prova: `${p(i.faturamentoVsMeta)} da meta`, regime: "competência", peso: i.monthlyTarget - i.faturamentoMes,
      acao: { texto: "ver comercial", rota: "/financeiro/resultados" },
    });
  }

  // Retirada dos sócios alta sobre a receita.
  if (temFaturamento && (i.retiradaSocios / i.faturamentoMes) * 100 > 30) {
    const pctRet = (i.retiradaSocios / i.faturamentoMes) * 100;
    out.push({
      id: "atn_retirada", tipo: "atencao", severidade: "leve", urgencia: "estrutural", tema: "retirada",
      titulo: "Retirada dos sócios está alta",
      frase: `Pró-labore + distribuição somam ${m(i.retiradaSocios)} — ${pctRet.toFixed(0)}% do faturamento. Verifique se cabe no resultado.`,
      prova: `${pctRet.toFixed(0)}% da receita`, regime: "competência", peso: i.retiradaSocios,
      acao: { texto: "ver resultado", rota: "/financeiro/resultados" },
    });
  }

  // Falta pouco pro break-even (zona de aperto, não prejuízo aberto).
  if (i.faltaPraLucro > 0 && i.margemLiquidaPct >= -3 && i.margemLiquidaPct < 8) {
    out.push({
      id: "atn_break_even", tipo: "atencao", severidade: "leve", urgencia: "comercial", tema: "resultado",
      titulo: "Falta pouco pro break-even",
      frase: `Faltam ${m(i.faltaPraLucro)} de faturamento pra cobrir os custos do período. Um empurrão no comercial cruza o ponto de equilíbrio.`,
      prova: `faltam ${m(i.faltaPraLucro)}`, regime: "competência", peso: i.faltaPraLucro,
      acao: { texto: "ver comercial", rota: "/financeiro/resultados" },
    });
  }

  // ═══════════════ OPORTUNIDADE ═══════════════

  // Margem acima da meta.
  if (i.metaMargem != null && i.margemLiquidaPct - i.metaMargem >= 5) {
    const delta = i.margemLiquidaPct - i.metaMargem;
    out.push({
      id: "opo_margem_meta", tipo: "oportunidade", severidade: delta >= 10 ? "destaque" : "normal", tema: "resultado-bom",
      titulo: "Margem acima da meta",
      frase: `Margem líquida em ${p(i.margemLiquidaPct)} — ${delta.toFixed(0)} pts acima da meta de ${i.metaMargem}%. A operação rendeu mais do que o planejado.`,
      prova: `margem ${p(i.margemLiquidaPct)}`, regime: "competência", peso: i.margemLiquidaValor,
      acao: { texto: "ver resultado", rota: "/financeiro/resultados" },
    });
  }

  // Faturamento bateu a meta.
  if (i.monthlyTarget > 0 && i.faturamentoVsMeta >= 100) {
    out.push({
      id: "opo_fat_meta", tipo: "oportunidade", severidade: "destaque", urgencia: "comercial", tema: "comercial-bom",
      titulo: "Meta de faturamento batida",
      frase: `Faturamento em ${m(i.faturamentoMes)} — ${p(i.faturamentoVsMeta)} da meta do período. Olhe o pipeline pra sustentar o ritmo.`,
      prova: `${p(i.faturamentoVsMeta)} da meta`, regime: "competência", peso: i.faturamentoMes,
      acao: { texto: "ver comercial", rota: "/financeiro/resultados" },
    });
  }

  // Geração de caixa positiva e acima da média (suprimida se caixa crítico).
  if (!caixaCritico && i.geracaoCaixa > 0 && i.geracaoMensalValores.length > 0) {
    const media = i.geracaoMensalValores.reduce((s, v) => s + v, 0) / i.geracaoMensalValores.length;
    if (media > 0 && i.geracaoCaixa > media * 1.15) {
      out.push({
        id: "opo_geracao", tipo: "oportunidade", severidade: "destaque", tema: "geracao",
        titulo: "Caixa gerando acima da média",
        frase: `O caixa gerou ${m(i.geracaoCaixa)} no período — acima da média dos últimos 6 meses (${m(media)}). Bom momento pra montar reserva.`,
        prova: `${m(i.geracaoCaixa)} no caixa`, regime: "caixa", peso: i.geracaoCaixa,
        acao: { texto: "ver caixa", rota: "/financeiro/runway" },
      });
    }
  }

  // Recebíveis grandes a entrar nos próximos 30 dias.
  if (i.entradas30dTotal > 0 && (i.entradas30dTotal >= i.burnRate || (i.entradas30dTop && i.aReceberMes > 0 && i.entradas30dTop.valor >= i.aReceberMes * 0.2))) {
    out.push({
      id: "opo_entradas30d", tipo: "oportunidade", severidade: "normal", urgencia: "até 30 dias", tema: "entradas",
      titulo: `${m(i.entradas30dTotal)} entram em 30 dias`,
      frase: `Recebíveis grandes a vencer${i.entradas30dTop ? ` — sendo ${m(i.entradas30dTop.valor)} de ${i.entradas30dTop.cliente}` : ""}. Se a cobrança andar no prazo, o caixa respira.`,
      prova: `${m(i.entradas30dTotal)} a entrar`, regime: "caixa", peso: i.entradas30dTotal,
      acao: { texto: "ver entradas", modal: "entradas30d" },
    });
  }

  // Cliente com ticket muito acima da média → upsell.
  if (i.ticketMedio > 0) {
    const alvo = i.clientes
      .filter((c) => c.proj >= 1 && c.ticket >= i.ticketMedio * 1.5)
      .sort((a, b) => b.ticket - a.ticket)[0];
    if (alvo) {
      out.push({
        id: "opo_upsell", tipo: "oportunidade", severidade: "normal", urgencia: "comercial", tema: "upsell",
        titulo: `Espaço pra upsell na ${alvo.nome}`,
        frase: `${alvo.nome} tem ticket de ${m(alvo.ticket)} — ${(alvo.ticket / i.ticketMedio).toFixed(1)}x a média da casa (${m(i.ticketMedio)}). Cliente que valoriza: dá pra propor mais escopo.`,
        prova: `ticket ${m(alvo.ticket)}`, regime: "competência", peso: alvo.fat,
        acao: { texto: "ver cliente", rota: "/clientes" },
      });
    }
  }

  // Cliente recorrente subprecificado → reprecificar.
  if (i.ticketMedio > 0) {
    const alvo = i.clientes
      .filter((c) => c.proj >= 2 && c.ticket > 0 && c.ticket <= i.ticketMedio * 0.6)
      .sort((a, b) => b.proj - a.proj)[0];
    if (alvo) {
      out.push({
        id: "opo_reprecificar", tipo: "oportunidade", severidade: "normal", urgencia: "comercial", tema: "reprecificar",
        titulo: `Reprecifique a ${alvo.nome}`,
        frase: `${alvo.nome} fez ${alvo.proj} projetos a ticket de ${m(alvo.ticket)} — bem abaixo da média (${m(i.ticketMedio)}). Recorrência subprecificada.`,
        prova: `ticket ${m(alvo.ticket)}`, regime: "competência", peso: i.ticketMedio - alvo.ticket,
        acao: { texto: "ver cliente", rota: "/clientes" },
      });
    }
  }

  // Base recorrente (MRR) relevante.
  if (temFaturamento && i.mrr / i.faturamentoMes >= 0.2) {
    const pctMrr = (i.mrr / i.faturamentoMes) * 100;
    out.push({
      id: "opo_mrr", tipo: "oportunidade", severidade: pctMrr >= 35 ? "destaque" : "normal", tema: "mrr",
      titulo: "Base recorrente forte",
      frase: `A receita recorrente é ${m(i.mrr)}/mês — ${pctMrr.toFixed(0)}% do faturamento. Base previsível que não depende de fechar projeto novo.`,
      prova: `${m(i.mrr)}/mês`, regime: "competência", peso: i.mrr,
      acao: { texto: "ver contratos", rota: "/configuracoes/contratos" },
    });
  }

  // Confortavelmente acima do break-even (suprimida se caixa crítico).
  if (!caixaCritico && i.faltaPraLucro < 0 && temFaturamento && Math.abs(i.faltaPraLucro) >= i.faturamentoMes * 0.15) {
    out.push({
      id: "opo_break_even", tipo: "oportunidade", severidade: "normal", urgencia: "comercial", tema: "resultado-bom",
      titulo: "Cada venda extra vira lucro",
      frase: `Você já passou o ponto de equilíbrio com ${m(Math.abs(i.faltaPraLucro))} de folga. Tudo que faturar a mais no período cai direto no lucro.`,
      prova: `${m(Math.abs(i.faltaPraLucro))} de folga`, regime: "competência", peso: Math.abs(i.faltaPraLucro),
      acao: { texto: "ver comercial", rota: "/financeiro/resultados" },
    });
  }

  // Recebimento saudável (margem caixa acompanha competência).
  if (i.trailingMargemLiquidaPct > 0 && i.trailingMargemCaixaPct > 0 && Math.abs(i.trailingMargemLiquidaPct - i.trailingMargemCaixaPct) <= 5) {
    out.push({
      id: "opo_timing_bom", tipo: "oportunidade", severidade: "normal", tema: "timing-bom",
      titulo: "Você recebe rápido",
      frase: `No papel você lucra ${p(i.trailingMargemLiquidaPct)} e no caixa ${p(i.trailingMargemCaixaPct)} — quase iguais. Sinal de que o que fatura, recebe rápido.`,
      prova: `gap de ${Math.abs(i.trailingMargemLiquidaPct - i.trailingMargemCaixaPct).toFixed(0)} pts`, regime: "caixa", peso: 40000,
      acao: { texto: "ver tendência", rota: "/financeiro/resultados" },
    });
  }

  // ── Dedup por tema: mantém o de maior severidade (desempate por peso) ──
  const porTema = new Map<string, Sinal>();
  for (const s of out) {
    const cur = porTema.get(s.tema);
    if (!cur || RANK[s.severidade] < RANK[cur.severidade] || (RANK[s.severidade] === RANK[cur.severidade] && s.peso > cur.peso)) {
      porTema.set(s.tema, s);
    }
  }

  // ── Ordena: severidade primeiro, depois peso (impacto/urgência) ──
  const ordenados = [...porTema.values()].sort((a, b) => RANK[a.severidade] - RANK[b.severidade] || b.peso - a.peso);

  return ordenados.slice(0, limite);
}

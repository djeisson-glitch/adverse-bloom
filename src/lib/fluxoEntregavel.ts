import { supabase } from "@/integrations/supabase/client";

/**
 * Transições do fluxo do entregável — FONTE ÚNICA.
 *
 * O card do entregável (FluxoCard) e a Minha mesa disparam as MESMAS ações por
 * aqui, pra não divergir. Regras: 1ª volta = 2 aprovações (N1→N2); qualquer
 * ajuste (do N1, N2 ou do cliente) manda de volta pro editor e o próximo ciclo
 * passa por 1 aprovação só. rev_ajuste_pendente lembra, entre N1 e N2, que teve
 * pedido de ajuste, pra depois do N2 voltar pro editor em vez de ir pra pronto.
 *
 * Timesheet (timer) e prompts de texto ficam com quem chama — aqui é só o
 * estado no banco.
 */

export type DelivFluxo = {
  id: string;
  status: string;
  retrabalho?: boolean | null;
  rev_ajuste_pendente?: boolean | null;
  rev_n1_ajuste?: boolean | null;
  rev_n2_ajuste?: boolean | null;
  revisoes_internas?: number | null;
  responsavel_id?: string | null;
};

const agora = () => new Date().toISOString();

async function upd(id: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as any).from("deliverables").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * LIBERAR PRA EDIÇÃO — a coordenação diz que o material do cliente chegou.
 * Enquanto isso não acontece a peça fica em `pendente` e NÃO aparece na mesa
 * do editor: peça sem arquivo na lista de trabalho ensina a desconfiar da
 * própria lista.
 */
export const PATCH_PRONTO_EDITAR = { status: "pronto_editar" };
/** EDITAR — patch de status; quem chama liga o timer. */
export const PATCH_EM_EDICAO = { status: "em_edicao" };
/** PARAR — patch de status; quem chama para o timer. */
export const PATCH_EM_PAUSA = { status: "em_pausa" };

/** ENVIAR PARA REVISÃO — 1ª vez vai pra N1; retrabalho vai só pra revisão única. */
export async function enviarParaRevisao(d: DelivFluxo, alteracaoAbertaId?: string | null): Promise<string> {
  if (alteracaoAbertaId) {
    await (supabase as any).from("deliverable_alteracoes")
      .update({ status: "resolvida", resolved_at: agora() }).eq("id", alteracaoAbertaId);
  }
  // Ciclo novo: zera o "pediu ajuste" dos dois níveis pra o badge não carregar
  // o âmbar do ciclo anterior.
  await upd(d.id, {
    status: d.retrabalho ? "revisao" : "revisao_n1",
    rev_ajuste_pendente: false, rev_n1_ajuste: false, rev_n2_ajuste: false,
  });
  return d.retrabalho ? "Enviado para revisão (Revisão 1)" : "Enviado para revisão (Revisão 1 → 2)";
}

/**
 * Posta a ÚNICA mensagem de ajuste no chat — só quando o entregável VOLTA pro
 * editor. Diz em qual etapa foi pedido (Aprovação 1, 2, ambas, ou revisão) e
 * aponta pro Frame.io, onde ficam as marcações de verdade. Não posta a cada
 * clique: se o N1 pede e segue pra N2, a mensagem sai depois, consolidada.
 */
async function anotarAjuste(deliverableId: string, userId: string | undefined, origens: string[]) {
  const onde =
    origens.length >= 2 ? "nas Aprovações 1 e 2" :
    origens.length === 1 ? `na ${origens[0]}` : "na revisão";
  await (supabase as any).from("comments").insert({
    entity_type: "deliverable", entity_id: deliverableId, user_id: userId,
    body: `🔧 Ajuste pedido ${onde} — ver os ajustes no Frame.io`, mentions: [],
  });
}

/** APROVAR na etapa atual: N1→N2, N2→pronto (ou volta se teve ajuste), revisão única→pronto. */
export async function aprovarEtapa(d: DelivFluxo, userId?: string): Promise<string> {
  const now = agora();
  if (d.status === "revisao_n1") {
    // Aprovar na R1 agora FECHA a revisão interna: vai pra "pronto".
    // Djêisson (19/08): "após a primeira aprovação que é da maiara, ela tenha
    // três opções... pra eu entrar só onde preciso mesmo." A R2 deixou de ser
    // obrigatória e virou escalada, decidida por quem revisa primeiro.
    await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: now, rev_n1_ajuste: false, status: "pronto" });
    return "Aprovado — pronto pra enviar ao cliente";
  }
  if (d.status === "revisao_n2") {
    if (d.rev_ajuste_pendente) {
      // R1 pediu ajuste e a R2 aprovou: volta pro editor com UMA mensagem (R1).
      // R2 aprovou (rev_n2_ajuste=false); o âmbar da R1 vem do rev_n1_ajuste
      // que ficou marcado lá atrás.
      await upd(d.id, {
        aprovado_n2_por: userId, aprovado_n2_em: now, rev_n2_ajuste: false, status: "ajuste_interno",
        retrabalho: true, rev_ajuste_pendente: false,
        revisoes_internas: (d.revisoes_internas || 0) + 1,
      });
      await anotarAjuste(d.id, userId, ["Revisão 1"]);
      return "Volta pro editor com os ajustes da Revisão 1";
    }
    await upd(d.id, { aprovado_n2_por: userId, aprovado_n2_em: now, rev_n2_ajuste: false, status: "pronto" });
    return "Aprovado — pronto pra enviar ao cliente";
  }
  // revisao (retrabalho, revisão única)
  await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: now, rev_n1_ajuste: false, status: "pronto" });
  return "Aprovado — pronto pra enviar";
}

/**
 * PEDIR AJUSTE na etapa atual. A mensagem no chat é ÚNICA e sai só quando o
 * entregável volta pro editor (identificando a etapa). Se o N1 pede, apenas
 * marca e segue pra N2 — a mensagem consolidada sai depois do N2.
 * `motivo` fica no argumento por compatibilidade, mas o detalhe do que mudar
 * vive no Frame.io (a mensagem só aponta pra lá).
 */
export async function pedirAjuste(d: DelivFluxo, userId: string | undefined, _motivo?: string): Promise<string> {
  const now = agora();
  if (d.status === "revisao_n1") {
    // Volta DIRETO pro editor. Antes o ajuste da R1 passava pela R2 pra sair
    // uma mensagem consolidada — mas isso obrigava o Djêisson a entrar num
    // caso em que não há decisão nenhuma pra ele tomar, e atrasava o editor
    // em um passo inteiro. A mensagem sai agora, citando a Revisão 1.
    await upd(d.id, {
      aprovado_n1_por: userId, aprovado_n1_em: now, rev_n1_ajuste: true,
      status: "ajuste_interno", retrabalho: true, rev_ajuste_pendente: false,
      revisoes_internas: (d.revisoes_internas || 0) + 1,
    });
    await anotarAjuste(d.id, userId, ["Revisão 1"]);
    return "Volta pro editor com os ajustes da Revisão 1";
  }
  if (d.status === "revisao_n2") {
    await upd(d.id, {
      aprovado_n2_por: userId, aprovado_n2_em: now, rev_n2_ajuste: true, status: "ajuste_interno",
      retrabalho: true, rev_ajuste_pendente: false,
      revisoes_internas: (d.revisoes_internas || 0) + 1,
    });
    // Se a R1 também tinha pedido, a mensagem cita as duas revisões.
    const origens = d.rev_ajuste_pendente ? ["Revisão 1", "Revisão 2"] : ["Revisão 2"];
    await anotarAjuste(d.id, userId, origens);
    return "Volta pro editor com os ajustes";
  }
  // revisão única (retrabalho)
  await upd(d.id, { status: "ajuste_interno", revisoes_internas: (d.revisoes_internas || 0) + 1 });
  await anotarAjuste(d.id, userId, ["revisão"]);
  return "Volta pro editor com os ajustes";
}

/**
 * APROVAR E ENVIAR AO CLIENTE — o caminho curto da R1.
 *
 * Um clique em vez de dois (aprovar → enviar), porque quem revisa na R1 é a
 * mesma pessoa que manda o link. O clique é a declaração de que enviou: se
 * ela ainda não mandou, o certo é "Aprovar" e enviar depois pelo botão do
 * fluxo.
 */
export async function aprovarEEnviarCliente(d: DelivFluxo, userId?: string): Promise<string> {
  await upd(d.id, {
    aprovado_n1_por: userId, aprovado_n1_em: agora(), rev_n1_ajuste: false,
    status: "com_cliente",
  });
  return "Aprovado e enviado ao cliente";
}

/**
 * FIQUEI EM DÚVIDA — escala pra Revisão 2.
 *
 * `aprovado_n1_em` é preenchido porque o campo marca QUEM PASSOU pela etapa 1
 * e quando, não "quem gostou" — e sem ele a peça sumiria da mesa do R2, que
 * filtra por essa marca. A dúvida fica registrada no chat, que é onde a
 * próxima pessoa vai procurar o motivo.
 */
export async function pedirRevisaoN2(d: DelivFluxo, userId?: string, duvida?: string): Promise<string> {
  await upd(d.id, {
    aprovado_n1_por: userId, aprovado_n1_em: agora(), rev_n1_ajuste: false,
    status: "revisao_n2", rev_ajuste_pendente: false, rev_n2_ajuste: false,
  });
  await (supabase as any).from("comments").insert({
    entity_type: "deliverable", entity_id: d.id, user_id: userId,
    body: `🤔 Revisão 1 ficou em dúvida e pediu uma segunda opinião${duvida ? `: ${duvida}` : "."}`,
    mentions: [],
  });
  return "Encaminhado pra Revisão 2";
}

/** Escalar a revisão única pra uma segunda revisão (opcional). */
export async function escalarAprovacao2(d: DelivFluxo): Promise<string> {
  await upd(d.id, { status: "revisao_n2", rev_ajuste_pendente: false, rev_n2_ajuste: false });
  return "Escalado para Revisão 2";
}

/** ENVIAR AO CLIENTE. */
export async function enviarAoCliente(d: DelivFluxo): Promise<string> {
  await upd(d.id, { status: "com_cliente" });
  return "Enviado para aprovação do cliente";
}

/** CLIENTE APROVOU. */
export async function clienteAprovou(d: DelivFluxo): Promise<string> {
  await upd(d.id, { status: "entregue", aprovado_cliente_em: agora() });
  return "Cliente aprovou 🎉";
}

/** ALTERAÇÃO DO CLIENTE: registra e volta pro editor (retrabalho → 1 aprovação). */
export async function registrarAlteracaoCliente(d: DelivFluxo, titulo: string): Promise<string> {
  // Numera igual ao portal (MAX+1). Sem isto o insert caía no default 1 e TODA
  // alteração registrada aqui virava "R1" — 17 das 22 do banco estavam assim,
  // então "R2, R3" nunca apareciam pra quem registra pelo sistema.
  const { data: ultima } = await (supabase as any)
    .from("deliverable_alteracoes")
    .select("numero").eq("deliverable_id", d.id)
    .order("numero", { ascending: false }).limit(1).maybeSingle();
  const numero = (ultima?.numero || 0) + 1;

  const { error } = await (supabase as any).from("deliverable_alteracoes").insert({
    deliverable_id: d.id, numero, titulo: titulo.trim(), origem: "cliente",
    criado_por: "Cliente", responsavel_id: d.responsavel_id || null,
  });
  if (error) throw error;
  // 'ajuste_solicitado' e não 'ajuste_interno': quem pediu foi o CLIENTE. Com o
  // status errado a peça aparecia como ajuste nosso — a tela dizia "pediram
  // ajuste interno" e o aviso saía como "Voltou pra você" em vez do crítico
  // "Pediram alteração".
  await upd(d.id, { status: "ajuste_solicitado", retrabalho: true });
  return `Alteração R${numero} registrada — voltou pro editor`;
}

/** Patch cru pra quem precisa (ex.: editar precisa só do status). */
export async function aplicarPatch(id: string, patch: Record<string, unknown>) {
  await upd(id, patch);
}

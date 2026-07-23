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
  revisoes_internas?: number | null;
  responsavel_id?: string | null;
};

const agora = () => new Date().toISOString();

async function upd(id: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as any).from("deliverables").update(patch).eq("id", id);
  if (error) throw error;
}

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
  await upd(d.id, { status: d.retrabalho ? "revisao" : "revisao_n1", rev_ajuste_pendente: false });
  return d.retrabalho ? "Enviado para revisão (Aprovação 1)" : "Enviado para revisão (Aprovação 1 → 2)";
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
    await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: now, status: "revisao_n2" });
    return "Aprovado → segue pra Aprovação 2";
  }
  if (d.status === "revisao_n2") {
    if (d.rev_ajuste_pendente) {
      // N1 pediu ajuste e o N2 aprovou: volta pro editor com UMA mensagem (N1).
      await upd(d.id, {
        aprovado_n2_por: userId, aprovado_n2_em: now, status: "ajuste_interno",
        retrabalho: true, rev_ajuste_pendente: false,
        revisoes_internas: (d.revisoes_internas || 0) + 1,
      });
      await anotarAjuste(d.id, userId, ["Aprovação 1"]);
      return "Volta pro editor com os ajustes da Aprovação 1";
    }
    await upd(d.id, { aprovado_n2_por: userId, aprovado_n2_em: now, status: "pronto" });
    return "Aprovado — pronto pra enviar ao cliente";
  }
  // revisao (retrabalho, revisão única)
  await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: now, status: "pronto" });
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
    // N1 pediu ajuste: NÃO posta ainda — lembra (rev_ajuste_pendente) e segue
    // pra N2, pra o editor receber tudo de uma vez numa mensagem só.
    await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: now, status: "revisao_n2", rev_ajuste_pendente: true });
    return "Ajuste anotado → segue pra Aprovação 2";
  }
  if (d.status === "revisao_n2") {
    await upd(d.id, {
      aprovado_n2_por: userId, aprovado_n2_em: now, status: "ajuste_interno",
      retrabalho: true, rev_ajuste_pendente: false,
      revisoes_internas: (d.revisoes_internas || 0) + 1,
    });
    // Se o N1 também tinha pedido, a mensagem cita as duas aprovações.
    const origens = d.rev_ajuste_pendente ? ["Aprovação 1", "Aprovação 2"] : ["Aprovação 2"];
    await anotarAjuste(d.id, userId, origens);
    return "Volta pro editor com os ajustes";
  }
  // revisão única (retrabalho)
  await upd(d.id, { status: "ajuste_interno", revisoes_internas: (d.revisoes_internas || 0) + 1 });
  await anotarAjuste(d.id, userId, ["revisão"]);
  return "Volta pro editor com os ajustes";
}

/** Escalar a revisão única pra uma segunda aprovação (opcional). */
export async function escalarAprovacao2(d: DelivFluxo): Promise<string> {
  await upd(d.id, { status: "revisao_n2", rev_ajuste_pendente: false });
  return "Escalado para Aprovação 2";
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
  const { error } = await (supabase as any).from("deliverable_alteracoes").insert({
    deliverable_id: d.id, titulo: titulo.trim(), origem: "cliente",
    criado_por: "Cliente", responsavel_id: d.responsavel_id || null,
  });
  if (error) throw error;
  await upd(d.id, { status: "ajuste_interno", retrabalho: true });
  return "Alteração do cliente registrada — voltou pro editor";
}

/** Patch cru pra quem precisa (ex.: editar precisa só do status). */
export async function aplicarPatch(id: string, patch: Record<string, unknown>) {
  await upd(id, patch);
}

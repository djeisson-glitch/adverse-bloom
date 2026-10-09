import { supabase } from "@/integrations/supabase/client";

/** Uma revisão interna por rodada. A aprovação segue para envio ao cliente. */

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
  return "Enviado para revisão interna";
}

/** Registra o retorno ao editor com referência às marcações do Frame.io. */
async function anotarAjuste(deliverableId: string, userId: string | undefined) {
  await (supabase as any).from("comments").insert({
    entity_type: "deliverable", entity_id: deliverableId, user_id: userId,
    body: "🔧 Ajuste pedido na revisão interna — ver os ajustes no Frame.io", mentions: [],
  });
}

/** Aprovação interna única, inclusive para peças legadas da R2. */
export async function aprovarEtapa(d: DelivFluxo, userId?: string): Promise<string> {
  await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: agora(), rev_n1_ajuste: false,
    rev_ajuste_pendente: false, status: "pronto" });
  return "Aprovado — pronto pra enviar ao cliente";
}

/** Ajustes voltam diretamente ao editor; a próxima revisão tem o mesmo aprovador. */
export async function pedirAjuste(d: DelivFluxo, userId: string | undefined, _motivo?: string): Promise<string> {
  await upd(d.id, { aprovado_n1_por: userId, aprovado_n1_em: agora(), rev_n1_ajuste: true,
    status: "ajuste_interno", retrabalho: true, rev_ajuste_pendente: false,
    revisoes_internas: (d.revisoes_internas || 0) + 1 });
  await anotarAjuste(d.id, userId);
  return "Volta pro editor com os ajustes da revisão interna";
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
    status: "com_cliente", rev_ajuste_pendente: false,
  });
  return "Aprovado e enviado ao cliente";
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

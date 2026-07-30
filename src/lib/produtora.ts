/**
 * Identidade da produtora nos documentos que saem pro cliente.
 *
 * Um lugar só: a carta e o PDF do orçamento liam disso separado, e o PDF
 * estava com o domínio ERRADO (adverse.com.br em vez de adverse.rec.br) —
 * indo assim pro cliente. Constante duplicada é constante que diverge.
 */
export const PRODUTORA = {
  wordmark: "adverse.rec",
  nome: "Adverse",
  descricao: "Produtora audiovisual",
  site: "adverse.rec.br",
  // Proposta é assinada por quem responde comercialmente.
  email: "djeisson@adverse.rec.br",
};

/**
 * Constantes de briefing de orçamento no padrão Catalunya.
 * Fonte: prints do Djeisson (2026-07-01).
 */

export const CANAIS_ENTRADA = [
  { value: "indicacao", label: "Indicação" },
  { value: "inbound", label: "Inbound (site/formulário)" },
  { value: "prospeccao", label: "Prospecção ativa" },
  { value: "agencia", label: "Agência" },
  { value: "cliente_recorrente", label: "Cliente recorrente" },
  { value: "evento", label: "Evento / networking" },
  { value: "outro", label: "Outro" },
] as const;

export const TIPOS_ORCAMENTO = [
  { value: "geral", label: "Geral" },
  { value: "institucional", label: "Filme institucional" },
  { value: "campanha", label: "Campanha publicitária" },
  { value: "serie", label: "Websérie" },
  { value: "reels", label: "Reels / conteúdo social" },
  { value: "evento", label: "Cobertura de evento" },
  { value: "produto", label: "Anúncio de produto" },
] as const;

export const PRECISA_ROTEIRO = [
  { value: "precisa", label: "Precisa de produção" },
  { value: "nao_precisa", label: "Não precisa" },
  { value: "ja_tem", label: "Cliente já tem" },
] as const;

export const PRECISA_ELENCO = [
  { value: "nao", label: "Não" },
  { value: "sim", label: "Sim" },
] as const;

export const MOEDAS = [
  { value: "BRL", label: "BRL (R$)" },
  { value: "USD", label: "USD ($)" },
] as const;

export const FORMATOS = [
  { value: "16x9", label: "16x9" },
  { value: "9x16", label: "9x16" },
  { value: "1x1", label: "1x1" },
  { value: "4x5", label: "4x5" },
  { value: "outro", label: "outro" },
] as const;

export const MEIOS_VEICULACAO = [
  { value: "internet", label: "Internet" },
  { value: "televisao", label: "Televisão" },
  { value: "tv_fechada", label: "TV Fechada" },
  { value: "radio", label: "Rádio" },
  { value: "midia_outdoor", label: "Mídia outdoor" },
  { value: "cinema", label: "Cinema" },
  { value: "festivais", label: "Festivais" },
  { value: "pdv", label: "PDV" },
  { value: "streaming", label: "Streaming (Spotify)" },
  { value: "eventos_internos", label: "Eventos internos e externos" },
  { value: "todos", label: "Todos os meios" },
  { value: "full_buyout", label: "full buyout" },
] as const;

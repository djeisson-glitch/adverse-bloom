/**
 * Constantes de briefing de orçamento — opções exatas do Catalunya OS.
 * Fonte: captura ao vivo do /orcamentos/novo (docs/catalunya-blueprint.md).
 */

export const CANAIS_ENTRADA = [
  { value: "email", label: "E-mail" },
  { value: "indicacao", label: "Indicação" },
  { value: "site", label: "Site" },
  { value: "redes_sociais", label: "Redes sociais" },
  { value: "whatsapp", label: "Whatsapp" },
  { value: "cliente_ativo", label: "Cliente ativo" },
  { value: "prospeccao_bdr", label: "Prospecção BDR" },
  { value: "outro", label: "Outro" },
] as const;

export const TIPOS_ORCAMENTO = [
  { value: "geral", label: "Geral" },
  { value: "so_producao", label: "Só produção" },
  { value: "so_pos_producao", label: "Só pós-produção" },
  { value: "fotos", label: "Fotos" },
  { value: "ia", label: "IA" },
] as const;

export const PRECISA_ROTEIRO = [
  { value: "ja_possui", label: "Já possui" },
  { value: "precisa", label: "Precisa de produção" },
  { value: "nao_precisa", label: "Não precisa" },
  { value: "em_construcao", label: "Em construção" },
] as const;

export const PRECISA_ELENCO = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
  { value: "modelo_mao", label: "Modelo de mão" },
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

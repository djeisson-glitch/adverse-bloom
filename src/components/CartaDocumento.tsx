import { formatCurrency } from "@/lib/format";

/**
 * Documento "INVESTIMENTO" no padrão Adverse — compartilhado pela carta interna
 * (CartaOrcamento) e pela carta pública do cliente (CartaPublica).
 * Só o layout do documento; cada página cuida da barra de ações / aprovação.
 */

export type Proposta = {
  titulo?: string;
  subtitulo?: string;
  briefing?: string;
  entregas_texto?: string;
  diarias?: string;
  equipe?: string;
  pos?: string;
  equipamentos?: string;
  nao_inclui?: string;
  investimento?: string;
  validade_dias?: number | string;
  condicoes_pagamento?: string;
};

export type CartaCliente = {
  nome?: string;
  contato?: string;
  email?: string;
  telefone?: string;
};

// Fonte única em lib/produtora — a carta e o PDF precisam dizer a mesma coisa.
export { PRODUTORA } from "@/lib/produtora";
import { PRODUTORA } from "@/lib/produtora";
import { porBloco, temConteudo, type Condicoes } from "@/lib/condicoes";

export const DEFAULTS: Proposta = {
  equipe: "Direção\nOperador de câmera\nAssistente",
  pos: "Edição e finalização\nColor grading",
  equipamentos: "Câmera cinema\nDrone\nIluminação",
  nao_inclui:
    "Imagens geradas por IA\nFotografia\nReduções/versões extras das especificadas aqui\nProdução de locação\nLegenda em outros idiomas\nDiária de produção extra por clima ruim, agenda do cliente e/ou outros fatores não controláveis pela produtora",
  validade_dias: 15,
  condicoes_pagamento: "à vista",
};

export const TIPO_LABEL: Record<string, string> = {
  geral: "Geral",
  so_producao: "Só produção",
  so_pos_producao: "Só pós-produção",
  fotos: "Fotos",
  ia: "IA",
  institucional: "Institucional",
};

export function linhas(t?: string) {
  return (t || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

// Aceita "6070", "6070.5" (US/planilha) e "6.070,00" (BR digitado).
export function parseValor(s?: string | number) {
  const str = String(s ?? "").replace(/[R$\s]/g, "").trim();
  if (!str) return 0;
  if (str.includes(",")) return Number(str.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(str) || 0;
}

/** Só o CSS/font da carta — cada página injeta uma vez. */
export const CARTA_STYLE = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
  .carta-root{font-family:'Montserrat',Inter,sans-serif}
  @media print{
    .no-print{display:none!important}

    /* MARGEM DE VERDADE. Estava margin:0 — o texto encostava na borda e a
       gráfica/PDF cortava. 16mm é margem de carta comercial. */
    @page{size:A4;margin:16mm}

    /* NO PAPEL, A CARTA É PRETO NO BRANCO.
       O tema escuro é da tela. Impresso, ele depende de "Gráficos de segundo
       plano" (que vem DESMARCADO no Chrome) e sai ou branco-no-branco ou
       chapado de tinta. Documento que se imprime, assina e arquiva se lê em
       papel branco — a identidade fica na tipografia e no // laranja.
       As classes abaixo são as cores do tema, remapeadas mantendo a
       hierarquia: título quase preto, corpo cinza escuro, apoio cinza. */
    /* O remapeamento para papel branco vale para a impressao do NAVEGADOR.
       O gerador de PDF do sistema marca <html class="pdf-escuro"> e escapa
       de tudo isto -- ver o bloco .pdf-escuro no fim deste @media. */
    html:not(.pdf-escuro),html:not(.pdf-escuro) body{background:#fff!important;height:auto!important}
    html:not(.pdf-escuro) .carta-doc{background:#fff!important;color:#333!important;padding:0!important}
    html:not(.pdf-escuro) .carta-doc .bg-\\[\\#0f0f10\\]{background:#fff!important}
    html:not(.pdf-escuro) .carta-doc .text-\\[\\#E8E1D0\\]{color:#111!important}
    html:not(.pdf-escuro) .carta-doc .text-\\[\\#CFC9BC\\]{color:#333!important}
    html:not(.pdf-escuro) .carta-doc .text-\\[\\#9A968C\\]{color:#666!important}
    html:not(.pdf-escuro) .carta-doc .border-white\\/10{border-color:#ddd!important}
    html:not(.pdf-escuro) .carta-doc .bg-\\[\\#ef4444\\]\\/\\[0\\.06\\]{background:#fef2f2!important}
    html:not(.pdf-escuro) .carta-doc .border-\\[\\#ef4444\\]\\/30{border-color:#fca5a5!important}
    /* O laranja da marca e os sinais de incluso/não incluso continuam em
       cor: são poucos e é o que dá leitura rápida no papel. */
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}

    /* Duas colunas em A4 retrato é o que estava cortando texto no meio: a
       grid vira UMA linha altíssima, e quando ela não cabe o navegador
       parte no meio, levando os dois lados junto. Em papel, coluna única —
       aí cada bloco pagina inteiro. */
    html:not(.pdf-escuro) .carta-grid{display:block!important}
    .carta-grid > div{margin-bottom:0}
    .carta-grid > div > div{margin-bottom:1.25rem}

    /* A carta saía cortada em UMA página porque os contêineres da tela
       (fixed, overflow-auto, max-width) prendiam o documento ao viewport.
       display:contents dissolve a caixa e mantém os filhos: o papel recebe
       o conteúdo direto, sem herdar nada de layout de tela. */
    .carta-shell,.carta-root{display:contents!important}
    .carta-doc{position:static!important;margin:0;max-width:none;width:100%}

    /* Bloco não parte no meio da folha — assinatura numa página e o item
       dela na outra é o tipo de coisa que faz o cliente reler. */
    .carta-bloco{break-inside:avoid;page-break-inside:avoid}
    .carta-capa{break-after:page;page-break-after:always}

    /* Seção que começa em folha nova: o contrato (elenco + condições) e o
       fecho com o valor. São as duas partes que alguém imprime sozinhas
       pra assinar ou levar pra reunião. */
    .carta-secao{break-before:page;page-break-before:always}

    /* ---- PDF ESCURO (gerado pelo servidor) ----
       So entra quando <html> tem .pdf-escuro, e quem poe essa classe e' o
       /api/carta-pdf, que roda Chrome com printBackground forcado. Por isso
       aqui o fundo e' garantido: nao depende de ninguem marcar "Graficos de
       segundo plano". O Ctrl+P do navegador NAO passa por aqui e continua
       saindo preto-no-branco -- se dependesse do checkbox, um esquecimento
       mandaria uma proposta praticamente em branco pro cliente. */
    html.pdf-escuro,html.pdf-escuro body{background:#0f0f10!important;height:auto!important}
    html.pdf-escuro .carta-doc{background:#0f0f10!important;padding:0!important}
    /* As duas colunas da tela cabem porque cada bloco e' indivisivel
       (.carta-bloco) e a folha e' A4 com 12mm -- o corte no meio que motivou
       a coluna unica vinha da margem de 16mm somada ao padding de tela. */
    html.pdf-escuro .carta-grid{display:grid!important;grid-template-columns:1fr 1fr!important;column-gap:3rem!important}
    html.pdf-escuro .carta-grid > div > div{break-inside:avoid;page-break-inside:avoid}
  }
  .carta-doc{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;

/**
 * Folha de estilo EXTRA do PDF escuro — injetada só por /api/carta-pdf,
 * depois de CARTA_STYLE, pra vencer o `@page` de lá.
 *
 * Por que existe separada: `@page` é regra de documento, não aceita seletor.
 * Não dá pra escrever "quando html.pdf-escuro, margem 0" — a única forma de
 * trocar a margem da folha é uma segunda regra `@page` que venha depois.
 *
 * E a margem TEM que ir a zero: medido em 26/08, o fundo do <html> NÃO se
 * propaga para a área de margem do @page no PDF do Chrome — qualquer margem
 * ali vira moldura branca com um retângulo preto no meio. Pintar a faixa por
 * headerTemplate também não resolve: fundo em header/footer não é impresso.
 * Então @page fica em 0 e o respiro vem de dentro: padding nas laterais e a
 * linha do <thead> em cima e embaixo.
 */
export const CARTA_PDF_ESCURO_STYLE = `
  @page{size:A4;margin:0}
  @media print{
    /* MARGEM HORIZONTAL: padding, que se repete em toda folha. */
    html.pdf-escuro .carta-doc{padding:0 15mm!important}

    /* MARGEM VERTICAL: a linha vazia do <thead> da .folha (ver carta-pdf.ts).
       Padding NAO serve aqui: num elemento que atravessa paginas ele aparece
       so no inicio da primeira e no fim da ultima -- as folhas do meio saiam
       com o texto colado no topo. E' exatamente o que o Djeisson viu em
       26/08. O <thead>, esse sim, o Chrome REPETE em cada folha impressa. */
    .folha{width:100%;border-collapse:collapse}
    .folha>thead>tr>td,.folha>tbody>tr>td,.folha>tfoot>tr>td{border:0;padding:0;margin:0}

    /* Sem as quebras forcadas o documento fecha em menos folhas. Elas faziam
       sentido no papel branco (secoes que alguem imprime soltas pra assinar);
       num PDF escuro, que se le na tela, so geravam paginas quase vazias. */
    html.pdf-escuro .carta-secao{break-before:auto!important;page-break-before:auto!important}

    /* A capa continua em folha propria: e' o que o cliente ve ao abrir o
       anexo. 100vh sem margem de pagina = exatamente uma folha. */
    html.pdf-escuro .carta-capa{min-height:calc(100vh - 28mm)!important}  /* 28mm = as duas faixas */

    /* O investimento tambem para de abrir folha propria. O !important aqui
       vence o style inline do elemento (declaracao important de folha ganha
       de inline sem important) -- e' de proposito: e' a unica forma de anular
       um breakBefore escrito no JSX sem tirar ele da versao clara. */
    html.pdf-escuro .carta-investimento{break-before:auto!important;page-break-before:auto!important}
    /* Com o fecho na mesma folha, repetir o cabecalho ali vira ruido. */
    html.pdf-escuro .carta-investimento > .print\\:block{display:none!important}
    html.pdf-escuro .carta-investimento > div + div{margin-top:2rem!important}
  }`;

export function CartaDocumento({
  p, investimentoNum, cliente, dataStr, condicoes, elenco,
}: {
  p: Proposta;
  investimentoNum: number;
  cliente?: CartaCliente;
  dataStr?: string;
  condicoes?: Condicoes | null;
  elenco?: { nome?: string; qtd?: number; diarias?: number }[] | null;
}) {
  return (
    <div className="carta-doc mx-auto max-w-5xl bg-[#0f0f10] px-10 py-12 text-[#CFC9BC] md:px-16 md:py-16">
      {/* CAPA — folha própria no PDF (break-after:page).
          Projeto, cliente e produtora grandes: é a página que o cliente vê ao
          abrir o anexo e a que ele encaminha pra diretoria. Sem ela o PDF
          começa no meio de uma tabela de entregas. */}
      <div className="carta-capa mb-16 flex min-h-[60vh] flex-col justify-between border-b border-white/10 pb-10 print:mb-0 print:min-h-[92vh] print:border-0 print:pb-0">
        <div>
          <span className="text-xl font-extrabold tracking-tight text-[#E8E1D0]">
            {PRODUTORA.wordmark} <span className="text-[#E53500]">//</span>
          </span>
          <p className="mt-1 text-xs text-[#9A968C]">{PRODUTORA.descricao}</p>
        </div>

        <div className="py-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9A968C]">
            Proposta de orçamento
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#E8E1D0] md:text-5xl">
            {p.titulo || "—"}
          </h1>
          {p.subtitulo && <p className="mt-2 text-lg text-[#9A968C]">{p.subtitulo}</p>}

          {/* O "para" completo mora aqui, na capa. Antes ele era repetido no
              topo do corpo, o que fazia o PDF abrir a segunda folha com todo o
              cabeçalho de novo — informação duplicada que parece erro. */}
          {(cliente?.nome || cliente?.contato) && (
            <div className="mt-8">
              <p className="text-[10px] uppercase tracking-wider text-[#9A968C]">Para</p>
              {cliente?.nome && cliente.nome.trim() !== (p.titulo || "").trim() && (
                <p className="text-lg font-semibold text-[#E8E1D0]">{cliente.nome}</p>
              )}
              {cliente?.contato && <p className="text-sm text-[#CFC9BC]">{cliente.contato}</p>}
              {cliente?.email && <p className="text-xs text-[#9A968C]">{cliente.email}</p>}
              {cliente?.telefone && <p className="text-xs text-[#9A968C]">{cliente.telefone}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-4 text-xs text-[#9A968C]">
          <span>{PRODUTORA.site} · {PRODUTORA.email}</span>
          {dataStr && <span>{dataStr}</span>}
        </div>
      </div>

      {/* Cabeçalho de continuação: uma linha só, pra quem pega a folha 2
          solta saber de que proposta é. O bloco institucional inteiro já foi
          na capa. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-3">
        <span className="text-sm font-extrabold tracking-tight text-[#E8E1D0]">
          {PRODUTORA.wordmark} <span className="text-[#E53500]">//</span>
        </span>
        <span className="text-xs text-[#9A968C]">
          {p.titulo}{p.subtitulo ? ` · ${p.subtitulo}` : ""}
        </span>
      </div>

      <div className="carta-grid mt-8 grid gap-x-16 gap-y-8 md:grid-cols-2">
        <div className="space-y-8">
          {p.briefing && <Bloco titulo="Briefing"><p className="leading-relaxed">{p.briefing}</p></Bloco>}
          {linhas(p.entregas_texto).length > 0 && (
            <Bloco titulo="Entregas">
              <ul className="space-y-1">{linhas(p.entregas_texto).map((l, i) => <li key={i}>· {l}</li>)}</ul>
            </Bloco>
          )}
          {linhas(p.diarias).length > 0 && (
            <Bloco titulo="Diárias">
              {linhas(p.diarias).map((l, i) => <p key={i} className={i === 0 ? "" : "text-sm text-[#9A968C]"}>{l}</p>)}
            </Bloco>
          )}
          {/* Não inclui — no lado, aproveitando o espaço do topo */}
          <Lista titulo="Não inclui" itens={linhas(p.nao_inclui)} />
        </div>
        <div className="space-y-8">
          <Lista titulo="Equipe" itens={linhas(p.equipe)} />
          <Lista titulo="Pós-produção" itens={linhas(p.pos)} />
          <Lista titulo="Equipamentos" itens={linhas(p.equipamentos)} />
        </div>
      </div>

      {/* ELENCO — quem aparece no filme, sem valor nenhum.
          Quando tem gente na frente da câmera o cliente precisa saber o que
          está contratando: quantas pessoas e por quantas diárias. O uso de
          imagem sai logo abaixo, nas condições, amarrado ao período e à praça
          — é a parte que vira problema quando fica implícita. */}
      {!!elenco?.length && (
        <div className="carta-bloco carta-secao mt-10 border-t border-white/10 pt-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9A968C]">Elenco</p>
          <ul className="mt-3 grid gap-x-10 gap-y-1.5 md:grid-cols-2">
            {elenco.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  <strong className="font-medium text-[#E8E1D0]">{Number(e.qtd) || 1}×</strong> {e.nome}
                </span>
                {Number(e.diarias) > 1 && (
                  <span className="shrink-0 text-xs text-[#9A968C]">{Number(e.diarias)} diárias</span>
                )}
              </li>
            ))}
          </ul>
          {(condicoes?.veiculacao?.periodo || condicoes?.veiculacao?.praca) && (
            <p className="mt-3 text-xs text-[#9A968C]">
              O uso de imagem do elenco vale
              {condicoes?.veiculacao?.periodo ? ` por ${condicoes.veiculacao.periodo}` : ""}
              {condicoes?.veiculacao?.praca ? ` em ${condicoes.veiculacao.praca}` : ""}.
              Renovação de prazo, praça adicional ou uso em peça não prevista aqui são orçados à parte.
            </p>
          )}
        </div>
      )}

      {/* Condições e direitos: item a item, com status escrito. É a seção que
          responde "tem Libras?" e "pode ir pra TV?" antes de virar discussão
          depois da aprovação. */}
      {temConteudo(condicoes) && (() => { const blocos = porBloco(condicoes); return (
        <div className="carta-bloco mt-10 border-t border-white/10 pt-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9A968C]">Condições e direitos</p>

          {(condicoes?.veiculacao?.periodo || condicoes?.veiculacao?.praca) && (
            <div className="mt-3 flex flex-wrap gap-x-10 gap-y-1 text-sm">
              {condicoes?.veiculacao?.periodo && (
                <p><span className="text-[#9A968C]">Período de veiculação:</span> {condicoes.veiculacao.periodo}</p>
              )}
              {condicoes?.veiculacao?.praca && (
                <p><span className="text-[#9A968C]">Praça:</span> {condicoes.veiculacao.praca}</p>
              )}
            </div>
          )}

          {/* Incluso e NÃO incluso em blocos separados: item negativo no meio
              dos positivos se lê como detalhe. Junto e em vermelho, vira a
              pergunta que o cliente precisa se fazer antes de aprovar. */}
          <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {blocos.inclusos.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#10b981]">Incluso</p>
                <ul className="mt-1.5 space-y-1">
                  {blocos.inclusos.map((i) => (
                    <li key={i.chave} className="flex items-baseline gap-2 text-sm">
                      <span className="text-[#10b981]">✓</span>
                      <span>
                        {i.rotulo}
                        {!!i.regimes?.length && <span className="text-[#9A968C]"> ({i.regimes.join(", ")})</span>}
                        {i.obs && <span className="block text-xs text-[#9A968C]">{i.obs}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {blocos.naoInclusos.length > 0 && (
              <div className="self-start rounded-md border border-[#ef4444]/30 bg-[#ef4444]/[0.06] px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-[#ef4444]">Não incluso</p>
                <ul className="mt-1.5 space-y-1">
                  {blocos.naoInclusos.map((i) => (
                    <li key={i.chave} className="flex items-baseline gap-2 text-sm">
                      <span className="text-[#ef4444]">✕</span>
                      <span className="text-[#E8E1D0]">
                        {i.rotulo}
                        {i.obs && <span className="block text-xs text-[#9A968C]">{i.obs}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-[#9A968C]">
                  Pode ser contratado à parte — fale com a gente antes de aprovar.
                </p>
              </div>
            )}

            {blocos.sobConsulta.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#9A968C]">Sob consulta</p>
                <ul className="mt-1.5 space-y-1">
                  {blocos.sobConsulta.map((i) => (
                    <li key={i.chave} className="flex items-baseline gap-2 text-sm">
                      <span className="text-[#9A968C]">•</span>
                      <span>
                        {i.rotulo}
                        {i.obs && <span className="block text-xs text-[#9A968C]">{i.obs}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ); })()}

      <div className="mt-12 border-t border-white/10 pt-4">
        <p className="text-xs text-[#9A968C]">Qualquer alteração desse escopo ou solicitação não prevista acarretará em custos extras.</p>
      </div>

      {/* Investimento — página própria na impressão; sem repetir o cabeçalho na tela */}
      <div className="carta-investimento mt-12 print:mt-16" style={{ breakBefore: "page" }}>
        <div className="hidden print:block">
          <Header />
        </div>
        <div className="mt-8 print:mt-24">
          <p className="text-lg text-[#9A968C]">Investimento <span className="text-sm">(R$)</span></p>
          <p className="text-6xl font-bold tracking-tight text-[#E8E1D0]">
            {investimentoNum ? formatCurrency(investimentoNum).replace("R$", "").trim() : "—"}
          </p>
          <p className="mt-4 text-sm text-[#9A968C]">Esta Proposta de Orçamento tem prazo de validade de {p.validade_dias || 15} dias.</p>
          <p className="text-sm text-[#9A968C]">(TRIBUTOS INCLUSOS), podendo sofrer ajustes após aprovação.</p>
          <p className="mt-6 text-sm font-semibold text-[#E8E1D0]">CONDIÇÕES DE PAGAMENTO: {p.condicoes_pagamento || "à vista"}.</p>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <div className="flex items-start justify-between">
      <span className="text-lg font-extrabold tracking-tight text-[#E8E1D0]">
        {PRODUTORA.wordmark} <span className="text-[#E53500]">//</span>
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9A968C]">Investimento</span>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    // carta-bloco: no papel, este bloco não parte entre duas folhas.
    <div className="carta-bloco">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#E8E1D0]">{titulo}</h2>
      <div className="text-[#CFC9BC]">{children}</div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <Bloco titulo={titulo}>
      <ul className="space-y-1">{itens.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </Bloco>
  );
}

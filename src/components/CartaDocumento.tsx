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
    .carta-doc{position:absolute;inset:0;margin:0}
    @page{margin:0}
    html,body{background:#0f0f10}
  }
  .carta-doc{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;

export function CartaDocumento({
  p, investimentoNum, cliente, dataStr,
}: {
  p: Proposta;
  investimentoNum: number;
  cliente?: CartaCliente;
  dataStr?: string;
}) {
  return (
    <div className="carta-doc mx-auto max-w-5xl bg-[#0f0f10] px-10 py-12 text-[#CFC9BC] md:px-16 md:py-16">
      {/* Topo institucional: produtora à esquerda, cliente/data à direita */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <span className="text-lg font-extrabold tracking-tight text-[#E8E1D0]">
            {PRODUTORA.wordmark} <span className="text-[#E53500]">//</span>
          </span>
          <p className="mt-1 text-xs text-[#9A968C]">{PRODUTORA.descricao}</p>
          <p className="text-xs text-[#9A968C]">{PRODUTORA.site} · {PRODUTORA.email}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9A968C]">Investimento</span>
          {(cliente?.nome || cliente?.contato) && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider text-[#9A968C]">Para</p>
              {cliente?.nome && <p className="text-sm font-semibold text-[#E8E1D0]">{cliente.nome}</p>}
              {cliente?.contato && <p className="text-xs text-[#9A968C]">{cliente.contato}</p>}
              {cliente?.email && <p className="text-xs text-[#9A968C]">{cliente.email}</p>}
              {cliente?.telefone && <p className="text-xs text-[#9A968C]">{cliente.telefone}</p>}
            </div>
          )}
          {dataStr && <p className="mt-2 text-xs text-[#9A968C]">{dataStr}</p>}
        </div>
      </div>

      <div className="mt-10">
        <h1 className="text-2xl font-bold text-[#E8E1D0]">{p.titulo || "—"}</h1>
        {p.subtitulo && <p className="text-sm text-[#9A968C]">{p.subtitulo}</p>}
      </div>

      <div className="mt-10 grid gap-x-16 gap-y-8 md:grid-cols-2">
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

      <div className="mt-12 border-t border-white/10 pt-4">
        <p className="text-xs text-[#9A968C]">Qualquer alteração desse escopo ou solicitação não prevista acarretará em custos extras.</p>
      </div>

      {/* Investimento — página própria na impressão; sem repetir o cabeçalho na tela */}
      <div className="mt-12 print:mt-16" style={{ breakBefore: "page" }}>
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
    <div>
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

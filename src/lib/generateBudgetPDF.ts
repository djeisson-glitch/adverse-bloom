import jsPDF from "jspdf";
import "jspdf-autotable";
import type { Budget, BudgetItem } from "@/hooks/useBudgets";

// Extend jsPDF type for autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const ADVERSE_RED = [220, 38, 38]; // hsl 0 72% 51% approx
const DARK_BG = [26, 26, 26];
const WHITE = [255, 255, 255];
const GRAY = [160, 160, 160];

function setDarkPage(doc: jsPDF) {
  doc.setFillColor(DARK_BG[0], DARK_BG[1], DARK_BG[2]);
  doc.rect(0, 0, 210, 297, "F");
}

function centerText(doc: jsPDF, text: string, y: number, size: number, color = WHITE) {
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  doc.text(text, 105, y, { align: "center" });
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export function generateBudgetPDF(budget: Budget, items: BudgetItem[]) {
  const doc = new jsPDF();

  // ─── PAGE 1: CAPA ──────────────────
  setDarkPage(doc);
  doc.setFontSize(48);
  doc.setTextColor(ADVERSE_RED[0], ADVERSE_RED[1], ADVERSE_RED[2]);
  doc.text("ADVERSE", 105, 120, { align: "center" });
  centerText(doc, "PRODUTORA", 135, 14, GRAY);
  centerText(doc, "PROPOSTA COMERCIAL", 170, 18);
  centerText(doc, budget.project_name.toUpperCase(), 185, 12, GRAY);
  centerText(doc, budget.client_name, 195, 11, GRAY);

  // ─── PAGE 2: SOBRE ──────────────────
  doc.addPage();
  setDarkPage(doc);
  centerText(doc, "SOBRE A ADVERSE", 40, 22);
  doc.setFontSize(11);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  const aboutText = [
    "A Adverse é uma produtora audiovisual focada em criar conteúdo",
    "de alto impacto para marcas que buscam se destacar.",
    "",
    "Combinamos criatividade, estratégia e execução técnica para",
    "entregar projetos que geram resultados mensuráveis.",
    "",
    "Nossa equipe multidisciplinar atua em todas as etapas da",
    "produção: do conceito à entrega final.",
  ];
  aboutText.forEach((line, i) => {
    doc.text(line, 105, 70 + i * 8, { align: "center" });
  });

  // ─── PAGE 3: MÉTODO ──────────────────
  doc.addPage();
  setDarkPage(doc);
  centerText(doc, "MÉTODO", 40, 22);
  const methodSteps = [
    "01. BRIEFING — Entendimento profundo do projeto",
    "02. PLANEJAMENTO — Roteiro, locações e cronograma",
    "03. PRODUÇÃO — Captação com equipe especializada",
    "04. PÓS-PRODUÇÃO — Edição, cor e finalização",
    "05. ENTREGA — Arquivos otimizados para cada plataforma",
  ];
  methodSteps.forEach((step, i) => {
    doc.setFontSize(12);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(step, 30, 70 + i * 18);
  });

  // ─── PAGE 4: INVESTIMENTO - BRIEFING ──────────────────
  doc.addPage();
  setDarkPage(doc);
  centerText(doc, "INVESTIMENTO — BRIEFING", 30, 18);

  doc.setFontSize(11);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(`Projeto: ${budget.project_name}`, 20, 50);
  doc.text(`Cliente: ${budget.client_name}`, 20, 58);

  // Group items by category
  const categories = [...new Set(items.map((i) => i.category))];
  let startY = 75;

  categories.forEach((cat) => {
    const catItems = items.filter((i) => i.category === cat);
    
    if (startY > 240) {
      doc.addPage();
      setDarkPage(doc);
      startY = 30;
    }

    doc.autoTable({
      startY,
      head: [[cat, "Qtd", "Tipo", "Valor"]],
      body: catItems.map((item) => [
        item.item_name,
        String(item.quantity),
        item.unit_type,
        formatBRL(item.client_price * item.quantity),
      ]),
      theme: "plain",
      headStyles: {
        fillColor: [ADVERSE_RED[0], ADVERSE_RED[1], ADVERSE_RED[2]],
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        textColor: [200, 200, 200],
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [35, 35, 35],
      },
      styles: {
        cellPadding: 4,
      },
      margin: { left: 20, right: 20 },
    });

    startY = doc.lastAutoTable.finalY + 10;
  });

  // ─── PAGE 5: INVESTIMENTO - VALOR ──────────────────
  doc.addPage();
  setDarkPage(doc);
  centerText(doc, "INVESTIMENTO — VALOR", 40, 18);

  doc.setFontSize(42);
  doc.setTextColor(ADVERSE_RED[0], ADVERSE_RED[1], ADVERSE_RED[2]);
  doc.text(formatBRL(budget.total_value), 105, 100, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  const breakdown = [
    `Sub-Total: ${formatBRL(budget.subtotal_2)}`,
    `Impostos: ${formatBRL(budget.tax_value)}`,
    budget.bv_value > 0 ? `BV: ${formatBRL(budget.bv_value)}` : null,
    budget.commission_value > 0 ? `Comissão: ${formatBRL(budget.commission_value)}` : null,
  ].filter(Boolean) as string[];

  breakdown.forEach((line, i) => {
    doc.text(line, 105, 120 + i * 8, { align: "center" });
  });

  centerText(doc, "Condições de pagamento:", 165, 12);
  centerText(doc, "50% na aprovação + 50% na entrega", 178, 11, GRAY);

  // ─── PAGE 6: NÃO INCLUI ──────────────────
  doc.addPage();
  setDarkPage(doc);
  centerText(doc, "NÃO INCLUI", 40, 18);

  const naoInclui = [
    "• Custos de deslocamento acima de 100km",
    "• Hospedagem e alimentação de equipe em viagens",
    "• Locações pagas (estúdios, espaços especiais)",
    "• Cachês de atores, modelos ou figurantes",
    "• Licenciamento de música ou imagens de banco",
    "• Alterações fora do escopo aprovado",
    "• Versões adicionais não previstas no briefing",
  ];
  naoInclui.forEach((line, i) => {
    doc.setFontSize(11);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(line, 30, 65 + i * 12);
  });

  // ─── PAGE 7: CONTATO ──────────────────
  doc.addPage();
  setDarkPage(doc);
  doc.setFontSize(36);
  doc.setTextColor(ADVERSE_RED[0], ADVERSE_RED[1], ADVERSE_RED[2]);
  doc.text("ADVERSE", 105, 110, { align: "center" });
  centerText(doc, "PRODUTORA", 125, 14, GRAY);
  centerText(doc, "contato@adverse.com.br", 160, 12, WHITE);
  centerText(doc, "www.adverse.com.br", 172, 11, GRAY);

  // Save
  doc.save(`Adverse_${budget.project_name.replace(/\s+/g, "_")}.pdf`);
}

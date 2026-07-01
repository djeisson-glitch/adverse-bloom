import { BookOpen, Compass, Layers, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Role = "TODOS" | "ADMIN" | "SUPER-ADMIN";

const ROLE_STYLES: Record<Role, string> = {
  TODOS: "bg-success/15 text-success border-success/30",
  ADMIN: "bg-primary/15 text-primary border-primary/30",
  "SUPER-ADMIN": "bg-warning/15 text-warning border-warning/30",
};

function RoleTag({ role }: { role: Role }) {
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_STYLES[role]}`}
    >
      {role}
    </span>
  );
}

type Modulo = {
  id: string;
  nome: string;
  role: Role;
  bloco: "PRODUÇÃO" | "GESTÃO" | "FINANCEIRO" | "EXTRAS";
  descricao: string;
  onda: 0 | 1 | 2 | 3 | 4;
};

const MODULOS: Modulo[] = [
  { id: "inicio", nome: "Início", role: "TODOS", bloco: "PRODUÇÃO", onda: 0, descricao: "Dashboard pessoal: projetos ativos, pipeline aberto, ocupação da equipe, follow-ups pendentes, minha semana em horas e meus projetos." },
  { id: "orcamentos", nome: "Orçamentos", role: "TODOS", bloco: "PRODUÇÃO", onda: 2, descricao: "Funil comercial em Kanban (Lead → Elaboração → Proposta → Negociação → Aceite). Planilha de produção com Quantidade × Diária/Horas × Valor unit, margem, agenciamento, imposto." },
  { id: "projetos", nome: "Projetos", role: "TODOS", bloco: "PRODUÇÃO", onda: 3, descricao: "Todos os projetos em andamento. Vistas Lista, Board, Calendário, Gantt e Finalizados. Cada projeto tem tarefas, prazo, equipe e orçamento vinculado." },
  { id: "fechamento", nome: "Fechamento", role: "ADMIN", bloco: "PRODUÇÃO", onda: 4, descricao: "Visão por projeto: horas × custos × valor × margem. Enquanto está em previsão os números são estimados; ao finalizar viram definitivos." },
  { id: "pos-producao", nome: "Pós-Produção", role: "TODOS", bloco: "PRODUÇÃO", onda: 3, descricao: "Fila de edição só do time com tag Edição. Vendidas × Mapeado × Realizado por projeto. É o que mede capacidade produtiva do pós." },
  { id: "pauta", nome: "Pauta", role: "TODOS", bloco: "PRODUÇÃO", onda: 3, descricao: "Todas as tarefas de todos os projetos em andamento, agrupadas por pessoa ou projeto. Substitui o Kanban do ClickUp." },
  { id: "calendario", nome: "Calendário", role: "TODOS", bloco: "PRODUÇÃO", onda: 3, descricao: "Tarefas e prazos dos projetos ativos numa vista mensal. Entregáveis (verde), tarefas (branco) e prazos do projeto (vermelho)." },
  { id: "horas", nome: "Horas", role: "TODOS", bloco: "PRODUÇÃO", onda: 4, descricao: "Lançamento de horas por projeto. O timer global (botão Apontar no topo) liga/pausa em qualquer tela e associa a um projeto." },
  { id: "timesheet", nome: "Timesheet", role: "TODOS", bloco: "PRODUÇÃO", onda: 4, descricao: "Grid semanal projeto × dia. Digite as horas direto na célula, pressione Enter. Vermelho se o dia passar de 8h." },
  { id: "capacidade", nome: "Capacidade", role: "ADMIN", bloco: "PRODUÇÃO", onda: 4, descricao: "Quantas horas faturáveis a equipe conseguiu apontar × capacidade total. Alvo 75–85%. Abaixo de 60% dispara alerta de ocioso." },
  { id: "planejamento", nome: "Planejamento", role: "ADMIN", bloco: "PRODUÇÃO", onda: 4, descricao: "Horas planejadas por pessoa nas próximas 6 semanas vs. capacidade. Antecipa gargalos antes de virarem incêndio." },
  { id: "previsao", nome: "Previsão", role: "ADMIN", bloco: "PRODUÇÃO", onda: 2, descricao: "Pipeline ponderado (orçamentos × probabilidade) projetando receita e carga vs. capacidade livre das próximas 6 semanas." },

  { id: "clientes", nome: "Clientes", role: "TODOS", bloco: "GESTÃO", onda: 0, descricao: "Cadastro dos clientes com contato principal, segmento e histórico de projetos e orçamentos. Já em produção." },
  { id: "contas-fees", nome: "Contas / Fees", role: "ADMIN", bloco: "GESTÃO", onda: 1, descricao: "Contas guarda-chuva (fees recorrentes) que agregam vários projetos sob o mesmo teto contratual mensal ou trimestral." },
  { id: "fornecedores", nome: "Fornecedores", role: "TODOS", bloco: "GESTÃO", onda: 1, descricao: "Diretório interno de fornecedores e freelas usados em orçamentos e projetos. Filtro por função, cidade e histórico." },
  { id: "follow-ups", nome: "Follow-ups", role: "TODOS", bloco: "GESTÃO", onda: 2, descricao: "Lembretes automáticos gerados +60 dias após cada orçamento ganho ou perdido — pra reabordar cliente na hora certa." },
  { id: "faturamento", nome: "Faturamento", role: "ADMIN", bloco: "GESTÃO", onda: 4, descricao: "Emite faturas por projeto ou cliente, acompanha recebimento. Ao marcar como paga, dispara receita no Conta Azul." },
  { id: "relatorios", nome: "Relatórios", role: "ADMIN", bloco: "GESTÃO", onda: 4, descricao: "Visão consolidada: funil, faturamento por cliente e mês, rentabilidade por projeto, conversão do funil." },
  { id: "time", nome: "Time", role: "ADMIN", bloco: "GESTÃO", onda: 1, descricao: "Cadastro da equipe com função, custo/hora, horas por semana e papel. Base de cálculo de custo e capacidade." },
  { id: "admin", nome: "Admin", role: "SUPER-ADMIN", bloco: "GESTÃO", onda: 1, descricao: "Usuários e papéis, workflows/status customizáveis, rate card padrão por função." },

  { id: "financeiro", nome: "Financeiro", role: "ADMIN", bloco: "FINANCEIRO", onda: 0, descricao: "Já em produção: DRE, Fluxo de Caixa, Custos, Runway, Insights (AI), Projeções 2026, Contas a Pagar. Sincroniza direto com o Conta Azul." },

  { id: "portal", nome: "Portal do Cliente", role: "TODOS", bloco: "EXTRAS", onda: 3, descricao: "Área externa onde o cliente acompanha os projetos, aprova entregas e vê o valor que a Adverse está entregando ao vivo." },
  { id: "guia", nome: "Guia", role: "TODOS", bloco: "EXTRAS", onda: 0, descricao: "Esta página. Documentação viva de cada módulo e da visão geral do sistema." },
];

const BLOCOS = ["PRODUÇÃO", "GESTÃO", "FINANCEIRO", "EXTRAS"] as const;

export default function Guia() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 py-8">
      {/* Hero */}
      <Card className="glass-card border-primary/20">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Adverse</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">OPERATING SYSTEM</h1>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">Produção · Gestão · Financeiro</p>
        </CardContent>
      </Card>

      {/* Intro */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-5 w-5 text-primary" />
            Guia do Adverse OS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Este é o sistema operacional da <strong className="text-foreground">Adverse Produtora</strong> — do primeiro
            contato com o cliente até a última fatura paga. Reúne comercial (funil e orçamentos), produção (projetos,
            tarefas e pós), operação (horas, timesheet e capacidade) e financeiro (auditado com Conta Azul).
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <div className="flex items-center gap-2"><RoleTag role="TODOS" /><span className="text-xs">toda a equipe</span></div>
            <div className="flex items-center gap-2"><RoleTag role="ADMIN" /><span className="text-xs">só admin (vê valores)</span></div>
            <div className="flex items-center gap-2"><RoleTag role="SUPER-ADMIN" /><span className="text-xs">só o dono do sistema</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Roadmap */}
      <Card className="glass-card border-warning/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Compass className="h-5 w-5 text-warning" />
            Roadmap · 5 ondas / ~11 semanas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { onda: "Onda 0", nome: "Redesign visual", desc: "Sidebar, header, guia, placeholders", semanas: "1 sem", ativo: true },
              { onda: "Onda 1", nome: "Fundação", desc: "Rate card, 5 papéis, RLS granular", semanas: "2 sem" },
              { onda: "Onda 2", nome: "Comercial", desc: "Kanban, follow-ups, previsão", semanas: "2 sem" },
              { onda: "Onda 3", nome: "Produção", desc: "Gantt, pauta, pós, portal", semanas: "3 sem" },
              { onda: "Onda 4", nome: "Operação", desc: "Timer, horas, fechamento, faturamento", semanas: "3 sem" },
            ].map((w) => (
              <div
                key={w.onda}
                className={`rounded-lg border p-3 ${w.ativo ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20"}`}
              >
                <p className={`text-[10px] font-bold uppercase tracking-wider ${w.ativo ? "text-primary" : "text-muted-foreground"}`}>{w.onda}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{w.nome}</p>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{w.desc}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{w.semanas}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Módulos por bloco */}
      {BLOCOS.map((bloco) => {
        const items = MODULOS.filter((m) => m.bloco === bloco);
        if (items.length === 0) return null;
        return (
          <Card key={bloco} className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  {bloco}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/50">
                {items.map((m) => (
                  <div key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex items-center gap-2 sm:w-56">
                      <a href={`/${m.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                        {m.nome}
                      </a>
                      <RoleTag role={m.role} />
                    </div>
                    <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{m.descricao}</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Onda {m.onda}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Papéis */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-4 w-4 text-primary" />
            Papéis e permissões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Admin</strong> — vê e edita tudo, inclusive valores em R$.{" "}
            <strong className="text-foreground">Produtor</strong> — coordena produção (pauta, fechamento, pós).{" "}
            <strong className="text-foreground">Equipe</strong> e <strong className="text-foreground">Edição</strong> —
            apontam horas e veem projetos/tarefas, mas <em>não</em> veem valores em R$.{" "}
            <strong className="text-foreground">Cliente</strong> — só vê o próprio portal.
          </p>
          <p>
            A tag <strong className="text-foreground">Edição</strong> é o que mede a capacidade produtiva do pós — ver{" "}
            <a href="/pos-producao" className="text-primary hover:underline">Pós-Produção</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { useDeals, useProfiles, STAGES, isWonStage, type Deal, type Stage } from "@/hooks/useDeals";
import { useCommercialSettings } from "@/hooks/useCommercialSettings";
import { useToast } from "@/hooks/use-toast";
import { LostReasonModal } from "@/components/comercial/LostReasonModal";
import { WonDealModal } from "@/components/comercial/WonDealModal";
import { KanbanBoard } from "@/components/comercial/KanbanBoard";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Funil comercial no estilo Catalunya OS.
 * Criar/editar orçamento acontece nas páginas /orcamentos/novo e
 * /orcamentos/:id (OrcamentoEditor) — clicar num card navega pra lá.
 * Os modais Lost/Won ficam só pro drag-and-drop entre colunas.
 */
export default function Orcamentos() {
  const { deals, updateDeal } = useDeals();
  const { data: profiles } = useProfiles();
  const { settings } = useCommercialSettings();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [vista, setVista] = useState<"board" | "lista">("board");
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stage: Stage } | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [wonDealTitle, setWonDealTitle] = useState("");
  const [wonClientName, setWonClientName] = useState("");

  const openDeals = useMemo(() => deals.filter((d) => d.stage !== "perdido"), [deals]);
  const activeDeals = useMemo(
    () => openDeals.filter((d) => !isWonStage(d.stage)),
    [openDeals],
  );
  const pipelineValue = useMemo(
    () => activeDeals.reduce((s, d) => s + ((d as any).approved_value ?? d.value ?? 0), 0),
    [activeDeals],
  );

  const handleMoveDeal = (dealId: string, newStage: Stage) => {
    if (newStage === "perdido") {
      setPendingMove({ dealId, stage: newStage });
      setLostOpen(true);
      return;
    }
    if (newStage === "aceite") {
      const deal = deals.find((d) => d.id === dealId);
      setWonDealTitle(deal?.title || "");
      setWonClientName(deal?.client?.name || "");
      setPendingMove({ dealId, stage: newStage });
      setWonOpen(true);
      return;
    }
    updateDeal.mutate(
      { id: dealId, stage: newStage },
      {
        onError: (err: any) =>
          toast({ title: "Erro ao mover", description: err.message, variant: "destructive" }),
      },
    );
  };

  // Assinatura vem da LostReasonModal legada: recebe { reason, otherReason?, followup? }
  const handleConfirmLost = (data: { reason: string; otherReason?: string; obs?: string; anexos?: any[] }) => {
    if (!pendingMove) return;
    updateDeal.mutate(
      {
        id: pendingMove.dealId, stage: pendingMove.stage, lost_reason: data.reason,
        // Guardar aqui também: as duas telas movem pra Perdido, e o histórico
        // não pode depender de por qual delas a pessoa passou.
        lost_obs: data.obs || null,
        lost_anexos: data.anexos || [],
      } as any,
      {
        onSuccess: () => {
          setLostOpen(false);
          setPendingMove(null);
          toast({
            title: "Marcado como perdido",
            description: "Follow-up automático criado em 60 dias.",
          });
        },
      },
    );
  };

  // WonDealModal envia { createBudget, createProject, followup? }
  const handleConfirmWon = (_opts: { createBudget: boolean; createProject: boolean }) => {
    if (!pendingMove) return;
    updateDeal.mutate(
      { id: pendingMove.dealId, stage: pendingMove.stage } as any,
      {
        onSuccess: () => {
          setWonOpen(false);
          setPendingMove(null);
          toast({
            title: "Aceite registrado",
            description: "Follow-up automático criado em 60 dias.",
          });
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Orçamentos</h1>
            <p className="text-sm text-muted-foreground">
              {activeDeals.length} abertos · pipeline{" "}
              <span className="font-medium text-primary">{formatCurrency(pipelineValue)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              onClick={() => setVista("board")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                vista === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setVista("lista")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                vista === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Lista
            </button>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground"
            onClick={() => navigate("/orcamentos/novo")}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo
          </Button>
        </div>
      </div>

      {vista === "board" ? (
        <KanbanBoard
          deals={openDeals}
          onMoveDeal={handleMoveDeal}
          onEditDeal={(d) => navigate(`/orcamentos/${d.id}`)}
        />
      ) : (
        <ListaOrcamentos
          deals={openDeals}
          onEdit={(d) => navigate(`/orcamentos/${d.id}`)}
          onOpenClient={(clientId) => clientId && navigate(`/clientes/${clientId}`)}
        />
      )}

      <div className="flex justify-end">
        <a
          href="/orcamentos-legado"
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Editor de planilha de orçamento (legado) →
        </a>
      </div>

      <LostReasonModal
        open={lostOpen}
        clientName={wonClientName}
        profiles={profiles || []}
        lossReasons={
          settings?.loss_reasons || [
            "Preço alto",
            "Sem budget agora",
            "Escolheu concorrente",
            "Projeto cancelado",
            "Sem resposta",
            "Outro",
          ]
        }
        followupDays={settings?.followup_lost_days ?? 60}
        onConfirm={handleConfirmLost}
        onCancel={() => {
          setLostOpen(false);
          setPendingMove(null);
        }}
      />

      <WonDealModal
        open={wonOpen}
        dealTitle={wonDealTitle}
        clientName={wonClientName}
        profiles={profiles || []}
        followupDays={settings?.followup_won_days ?? 60}
        onConfirm={handleConfirmWon}
        onCancel={() => {
          setWonOpen(false);
          setPendingMove(null);
        }}
      />
    </div>
  );
}

function ListaOrcamentos({
  deals,
  onEdit,
  onOpenClient,
}: {
  deals: Deal[];
  onEdit: (d: Deal) => void;
  onOpenClient: (clientId: string | null | undefined) => void;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="grid grid-cols-[1fr_180px_140px_140px_60px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Orçamento</span>
          <span>Estágio</span>
          <span className="text-right">Valor</span>
          <span>Cliente</span>
          <span />
        </div>
        {deals.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhum orçamento aberto.
          </div>
        ) : (
          deals.map((d) => {
            const stage = STAGES.find((s) => s.id === d.stage);
            return (
              <div
                key={d.id}
                className="grid cursor-pointer grid-cols-[1fr_180px_140px_140px_60px] items-center gap-2 border-b border-border/40 px-5 py-3 last:border-0 hover:bg-sidebar-accent/40"
                onClick={() => onEdit(d)}
              >
                <span className="truncate font-medium text-foreground">{d.title}</span>
                <span className="flex items-center gap-1 text-xs">
                  <span style={{ color: stage?.color }}>●</span>
                  <span className="text-muted-foreground">{stage?.label || d.stage}</span>
                </span>
                <span className="text-right text-sm font-medium text-primary">
                  {formatCurrency((d as any).approved_value ?? d.value ?? 0)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenClient(d.client_id);
                  }}
                  className="truncate text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  {d.client?.name || "—"}
                </button>
                <span className="text-right text-xs text-muted-foreground">Editar</span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

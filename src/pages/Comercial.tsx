import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodFilter, type PeriodRange } from "@/components/PeriodFilter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDeals, useClients, useProfiles, type Deal, type Stage } from "@/hooks/useDeals";
import { useTasks } from "@/hooks/useTasks";
import { useCommercialSettings } from "@/hooks/useCommercialSettings";
import { KanbanBoard } from "@/components/comercial/KanbanBoard";
import { DealFormModal } from "@/components/comercial/DealFormModal";
import { LostReasonModal } from "@/components/comercial/LostReasonModal";
import { WonDealModal } from "@/components/comercial/WonDealModal";
import { Indicadores } from "@/components/comercial/Indicadores";
import { useNavigate } from "react-router-dom";

function currentMonthRange(): PeriodRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
    to: `${y}-${String(m + 1).padStart(2, "0")}-${lastDay}`,
  };
}

export default function Comercial() {
  const { deals, createDeal, updateDeal } = useDeals();
  const { clients, createClient } = useClients();
  const { data: profiles } = useProfiles();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { settings } = useCommercialSettings();

  // Tasks for counts and follow-ups
  const { allTasks, createTask: createFollowupTask } = useTasks("__all__");

  const [period, setPeriod] = useState<PeriodRange>(currentMonthRange);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingMove, setPendingMove] = useState<{ dealId: string; stage: Stage } | null>(null);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [wonDealTitle, setWonDealTitle] = useState("");
  const [wonClientName, setWonClientName] = useState("");

  // Filter deals by period
  // Pipeline shows ALL active deals (not filtered by period)
  // Period filter only applies to Indicadores tab
  const pipelineDeals = useMemo(() => deals, [deals]);

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      const created = d.created_at ? d.created_at.slice(0, 10) : "";
      return created >= period.from && created <= period.to;
    });
  }, [deals, period]);

  // Task counts per deal
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (allTasks || []).forEach((t) => {
      if (t.deal_id && !t.completed) {
        counts[t.deal_id] = (counts[t.deal_id] || 0) + 1;
      }
    });
    return counts;
  }, [allTasks]);

  const handleMoveDeal = (dealId: string, newStage: Stage) => {
    if (newStage === "perdido") {
      const deal = deals.find((d) => d.id === dealId);
      setWonClientName(deal?.client?.name || "");
      setPendingMove({ dealId, stage: newStage });
      setLostModalOpen(true);
    } else if (newStage === "fechado_ganho") {
      const deal = deals.find((d) => d.id === dealId);
      setWonDealTitle(deal?.title || "");
      setWonClientName(deal?.client?.name || "");
      setPendingMove({ dealId, stage: newStage });
      setWonModalOpen(true);
    } else {
      updateDeal.mutate({ id: dealId, stage: newStage });
    }
  };

  const handleLostConfirm = async (data: { reason: string; followup?: { title: string; dueDate: string; responsibleId: string } }) => {
    if (pendingMove) {
      const deal = deals.find((d) => d.id === pendingMove.dealId);
      await updateDeal.mutateAsync({
        id: pendingMove.dealId,
        stage: "perdido",
        notes: deal?.notes ? `${deal.notes}\n[Motivo da perda] ${data.reason}` : `[Motivo da perda] ${data.reason}`,
        lost_reason: data.reason,
      });
      if (data.followup) {
        await createFollowupTask.mutateAsync({
          deal_id: pendingMove.dealId,
          client_id: deal?.client_id || null,
          title: data.followup.title,
          due_date: data.followup.dueDate,
          created_by: data.followup.responsibleId || user?.id || null,
        });
      }
    }
    setLostModalOpen(false);
    setPendingMove(null);
  };

  const handleWonConfirm = async (opts: { createBudget: boolean; createProject: boolean; followup?: { title: string; dueDate: string; responsibleId: string } }) => {
    if (pendingMove) {
      const deal = deals.find((d) => d.id === pendingMove.dealId);
      await updateDeal.mutateAsync({ id: pendingMove.dealId, stage: "fechado_ganho" });
      if (opts.followup) {
        await createFollowupTask.mutateAsync({
          deal_id: pendingMove.dealId,
          client_id: deal?.client_id || null,
          title: opts.followup.title,
          due_date: opts.followup.dueDate,
          created_by: opts.followup.responsibleId || user?.id || null,
        });
      }
      // Create production project from deal
      if (opts.createProject && deal) {
        await supabase.from("projects").insert({
          name: deal.title,
          client_name: deal.client?.name || "",
          client_id: deal.client_id || null,
          sold_value: deal.value || 0,
          status: "Pré-produção",
          sold_date: new Date().toISOString().slice(0, 10),
        });
      }
      if (opts.createBudget && deal) {
        navigate("/orcamentos", { state: { fromDeal: deal } });
      }
    }
    setWonModalOpen(false);
    setPendingMove(null);
  };

  const handleSaveDeal = async (data: any) => {
    setSaving(true);
    try {
      if (editingDeal) {
        await updateDeal.mutateAsync({ id: editingDeal.id, ...data });
        toast({ title: "Deal atualizado" });
      } else {
        await createDeal.mutateAsync({ ...data, created_by: data.created_by || user?.id });
        toast({ title: "Deal criado com sucesso" });
      }
      setFormOpen(false);
      setEditingDeal(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClient = async (name: string) => {
    const result = await createClient.mutateAsync({ name });
    return result;
  };

  const openNewDeal = () => { setEditingDeal(null); setFormOpen(true); };
  const openEditDeal = (deal: Deal) => { setEditingDeal(deal); setFormOpen(true); };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Comercial</h1>
          <p className="text-sm text-muted-foreground">Pipeline de vendas e indicadores</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button onClick={openNewDeal}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Deal
          </Button>
        </div>
      </motion.div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <KanbanBoard deals={pipelineDeals} onMoveDeal={handleMoveDeal} onEditDeal={openEditDeal} taskCounts={taskCounts} />
        </TabsContent>

        <TabsContent value="indicadores" className="mt-4">
          <Indicadores deals={filteredDeals} meta={settings.monthly_target} allTasks={allTasks} periodFrom={period.from} periodTo={period.to} />
        </TabsContent>
      </Tabs>

      <DealFormModal
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingDeal(null); }}
        deal={editingDeal}
        clients={clients}
        profiles={profiles || []}
        onSave={handleSaveDeal}
        onCreateClient={handleCreateClient}
        saving={saving}
      />

      <LostReasonModal
        open={lostModalOpen}
        clientName={wonClientName}
        profiles={profiles || []}
        lossReasons={settings.loss_reasons || ["Preço alto", "Sem budget agora", "Escolheu concorrente", "Projeto cancelado", "Sem resposta", "Outro"]}
        followupDays={settings.followup_lost_days}
        onConfirm={handleLostConfirm}
        onCancel={() => { setLostModalOpen(false); setPendingMove(null); }}
      />

      <WonDealModal
        open={wonModalOpen}
        dealTitle={wonDealTitle}
        clientName={wonClientName}
        profiles={profiles || []}
        followupDays={settings.followup_won_days}
        onConfirm={handleWonConfirm}
        onCancel={() => { setWonModalOpen(false); setPendingMove(null); }}
      />
    </div>
  );
}

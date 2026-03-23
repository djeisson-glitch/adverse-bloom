import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDeals, useClients, useProfiles, type Deal, type Stage } from "@/hooks/useDeals";
import { KanbanBoard } from "@/components/comercial/KanbanBoard";
import { DealFormModal } from "@/components/comercial/DealFormModal";
import { LostReasonModal } from "@/components/comercial/LostReasonModal";
import { WonDealModal } from "@/components/comercial/WonDealModal";
import { Indicadores } from "@/components/comercial/Indicadores";
import { useNavigate } from "react-router-dom";

export default function Comercial() {
  const { deals, createDeal, updateDeal } = useDeals();
  const { clients, createClient } = useClients();
  const { data: profiles } = useProfiles();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [saving, setSaving] = useState(false);

  // Stage change modals
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stage: Stage } | null>(null);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [wonDealTitle, setWonDealTitle] = useState("");

  const handleMoveDeal = (dealId: string, newStage: Stage) => {
    if (newStage === "perdido") {
      setPendingMove({ dealId, stage: newStage });
      setLostModalOpen(true);
    } else if (newStage === "ganho") {
      const deal = deals.find((d) => d.id === dealId);
      setWonDealTitle(deal?.title || "");
      setPendingMove({ dealId, stage: newStage });
      setWonModalOpen(true);
    } else {
      updateDeal.mutate({ id: dealId, stage: newStage });
    }
  };

  const handleLostConfirm = (reason: string) => {
    if (pendingMove) {
      updateDeal.mutate({
        id: pendingMove.dealId,
        stage: "perdido",
        notes: reason ? `[Motivo da perda] ${reason}` : undefined,
      });
    }
    setLostModalOpen(false);
    setPendingMove(null);
  };

  const handleWonConfirm = (createBudget: boolean) => {
    if (pendingMove) {
      updateDeal.mutate({ id: pendingMove.dealId, stage: "ganho" });
      if (createBudget) {
        const deal = deals.find((d) => d.id === pendingMove.dealId);
        if (deal) {
          navigate("/orcamentos", { state: { fromDeal: deal } });
        }
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

  const openNewDeal = () => {
    setEditingDeal(null);
    setFormOpen(true);
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comercial</h1>
          <p className="text-sm text-muted-foreground">Pipeline de vendas e indicadores</p>
        </div>
        <Button onClick={openNewDeal}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Deal
        </Button>
      </motion.div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <KanbanBoard deals={deals} onMoveDeal={handleMoveDeal} onEditDeal={openEditDeal} />
        </TabsContent>

        <TabsContent value="indicadores" className="mt-4">
          <Indicadores deals={deals} />
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
        onConfirm={handleLostConfirm}
        onCancel={() => { setLostModalOpen(false); setPendingMove(null); }}
      />

      <WonDealModal
        open={wonModalOpen}
        dealTitle={wonDealTitle}
        onConfirm={handleWonConfirm}
        onCancel={() => { setWonModalOpen(false); setPendingMove(null); }}
      />
    </div>
  );
}

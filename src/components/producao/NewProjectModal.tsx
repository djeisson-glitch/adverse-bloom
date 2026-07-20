import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateProject, PRODUCTION_STAGES_NEW } from "@/hooks/useProjects";
import { useClientesPublico } from "@/hooks/useDeals";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function NewProjectModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateProject();
  // Lista pública (só nome) — o time escolhe o cliente sem acessar a ficha.
  const { clientes: clients } = useClientesPublico();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    client_id: "",
    client_name: "",
    sold_value: "",
    status: "briefing",
    start_date: "",
    delivery_date: "",
  });

  const submit = async () => {
    if (!form.name) return toast.error("Informe o nome do projeto");
    try {
      const clientName = form.client_id
        ? clients.find((c) => c.id === form.client_id)?.name || form.client_name
        : form.client_name;
      const project = await create.mutateAsync({
        name: form.name,
        client_id: form.client_id || null,
        client_name: clientName || "",
        sold_value: form.sold_value ? Number(form.sold_value) : 0,
        status: form.status,
        sold_date: new Date().toISOString().slice(0, 10),
        delivery_date: form.delivery_date || null,
        start_date: form.start_date || null,
      } as any);
      toast.success("Projeto criado");
      onOpenChange(false);
      if (project?.id) navigate(`/projetos/${project.id}`);
    } catch (e: any) {
      toast.error("Erro ao criar", { description: e.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Cliente</Label>
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                value={form.sold_value}
                onChange={(e) => setForm({ ...form, sold_value: e.target.value })}
              />
            </div>
            <div>
              <Label>Início</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Entrega</Label>
              <Input
                type="date"
                value={form.delivery_date}
                onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Etapa inicial</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCTION_STAGES_NEW.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Criar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

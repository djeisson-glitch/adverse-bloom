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
import { hojeISO } from "@/lib/dataLocal";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ui/confirm";

export function NewProjectModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateProject();
  const confirmar = useConfirm();
  // Lista pública (só nome) — o time escolhe o cliente sem acessar a ficha.
  const { clientes: clients } = useClientesPublico();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    client_id: "",
    client_name: "",
    sold_value: "",
    status: "novo",
    start_date: "",
    delivery_date: "",
  });

  /**
   * Nome repetido AVISA, não impede.
   *
   * Djêisson: "pode acontecer, mas aparece o aviso pedindo se a pessoa quer
   * seguir mesmo assim". Antes o banco renomeava sozinho e em silêncio
   * ("PODCAST" virava "PODCAST_0726") — nome que o dono não reconhece depois
   * é pior que nome repetido que ele escolheu.
   *
   * Mostra QUAIS projetos já usam o nome: sem isso o aviso vira um "tem
   * certeza?" que todo mundo aprende a clicar sem ler.
   */
  const podeSeguirComNomeRepetido = async (nome: string, clientId: string | null) => {
    const { data, error } = await (supabase as any).rpc("projetos_mesmo_nome", {
      _client_id: clientId,
      _nome: nome,
    });
    // Falha na checagem não bloqueia a criação: o aviso é uma cortesia, e
    // impedir o trabalho porque a consulta caiu seria o pior dos mundos.
    if (error || !data?.length) return true;

    const mesmoCliente = (data as any[]).filter((p) => p.mesmo_cliente);
    const outros = (data as any[]).filter((p) => !p.mesmo_cliente);
    const lista = [...mesmoCliente, ...outros].slice(0, 5);

    return confirmar({
      title: mesmoCliente.length ? "Este cliente já tem um projeto com esse nome" : "Já existe projeto com esse nome",
      description: (
        <span className="block space-y-2">
          <span className="block">
            {lista.map((p) => (
              <span key={p.id} className="block font-mono text-xs">
                {p.name}
                {!p.mesmo_cliente && p.client_name ? ` · ${p.client_name}` : ""}
              </span>
            ))}
          </span>
          <span className="block">Criar assim mesmo?</span>
        </span>
      ),
      confirmText: "Criar assim mesmo",
    });
  };

  const submit = async () => {
    if (!form.name) return toast.error("Informe o nome do projeto");
    if (!(await podeSeguirComNomeRepetido(form.name, form.client_id || null))) return;
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
        sold_date: hojeISO(),
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

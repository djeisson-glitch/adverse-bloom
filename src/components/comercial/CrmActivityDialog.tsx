import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import type { Deal } from "@/hooks/useDeals";
import type { CrmActivity } from "@/lib/crm";
import { hojeISO } from "@/lib/dataLocal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CrmActivityDialog({activity, dealId, deals, profiles, onClose, onSaved}: {
  activity?: CrmActivity; dealId?: string; deals: Deal[];
  profiles: {id:string; full_name:string | null}[]; onClose:()=>void; onSaved:()=>Promise<void>;
}) {
  const {user} = useAuth();
  const {can} = usePermissions();
  const [title,setTitle] = useState(activity?.title || "");
  const [due,setDue] = useState(activity?.due || hojeISO());
  const [owner,setOwner] = useState(activity ? activity.owner || "" : user?.id || "");
  const [deal,setDeal] = useState(activity?.dealId || dealId || "");
  const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
  const save = useMutation({
    mutationFn: async () => {
      if (!can(activity?.source === "followup" ? "follow_ups" : "orcamentos", "edit")) throw new Error("Sem permissão para editar.");
      if (!title.trim() || !due || (!activity && !deal)) throw new Error("Informe atividade, data e negócio.");
      if (activity?.source === "followup") {
        const {error} = await supabase.from("follow_ups").update({descricao:title.trim(),data_prevista:due,responsavel_id:owner || null}).eq("id",activity.id).select("id").single();
        if(error) throw error;
      } else {
        const fields = {title:title.trim(),due_date:due,assigned_user_id:owner || null};
        const result = activity
          ? await supabase.from("tasks").update(fields).eq("id",activity.id).select("id").single()
          : await supabase.from("tasks").insert({...fields,deal_id:deal,client_id:deals.find(d=>d.id===deal)?.client_id || null,created_by:user?.id || null}).select("id").single();
        if(result.error) throw result.error;
      }
    },
    onSuccess: async () => {await onSaved(); toast.success("Atividade salva"); onClose();},
    onError: (e:Error) => toast.error("Não salvou a atividade",{description:e.message}),
  });
  return <Dialog open onOpenChange={open => !open && !save.isPending && onClose()}>
    <DialogContent><DialogHeader><DialogTitle>{activity ? "Editar atividade" : "Nova atividade comercial"}</DialogTitle></DialogHeader>
      <form onSubmit={e=>{e.preventDefault();save.mutate();}} className="space-y-4">
        <div><Label htmlFor="crm-title">O que precisa acontecer?</Label><Input id="crm-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: confirmar retorno da proposta" required /></div>
        {!activity && <div><Label htmlFor="crm-deal">Negócio</Label><select id="crm-deal" className={field} value={deal} onChange={e=>setDeal(e.target.value)} required><option value="">Selecionar negócio</option>{deals.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></div>}
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="crm-due">Data</Label><Input id="crm-due" type="date" value={due} onChange={e=>setDue(e.target.value)} required /></div>
        <div><Label htmlFor="crm-owner">Responsável</Label><select id="crm-owner" className={field} value={owner} onChange={e=>setOwner(e.target.value)}><option value="">Sem responsável</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || "Pessoa da equipe"}</option>)}</select></div></div>
        <DialogFooter><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={save.isPending}>{save.isPending?"Salvando…":"Salvar atividade"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

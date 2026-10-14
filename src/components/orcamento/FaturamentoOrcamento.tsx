import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { salvarPropostaCampos } from '@/lib/salvarProposta';
import { toast } from 'sonner';
import { BALDES, balde } from '@/lib/faturamentoBalde';

export function FaturamentoOrcamento({ budget }: { budget: any }) {
  const qc = useQueryClient();
  const [saving,setSaving] = useState(false);
  const [modo,setModo] = useState(budget.proposta?.faturamento ? balde(budget.proposta.faturamento) : "");
  async function salvar(value: string) {
    setSaving(true);
    try {
      await salvarPropostaCampos(budget.id, { faturamento: value });
      setModo(balde(value));
      await Promise.all(['orcamento-budget','projects','projects-client','contrato-movimentos'].map(key=>qc.invalidateQueries({queryKey:[key]})));
      toast.success('Cobrança salva no orçamento e nos projetos vinculados');
    } catch(e:any) { toast.error('Não salvou a cobrança', {description:e.message}); }
    finally {setSaving(false);}
  }
  return <div className="rounded-lg border border-border/60 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
    <div><p className="text-sm font-medium">Cobrança</p></div>
    <Select value={modo} onValueChange={salvar} disabled={saving}>
      <SelectTrigger aria-label="Cobrança do orçamento" className="mt-2 sm:mt-0 sm:w-72"><SelectValue placeholder="Definir cobrança" /></SelectTrigger>
      <SelectContent>{BALDES.map(b=><SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

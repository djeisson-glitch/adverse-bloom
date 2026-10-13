import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { tipoMidia } from '@/lib/midiaContrato';
import type { MovimentoContrato } from '@/lib/consumoContrato';

export default function ClassificarEntregaContrato({ movimento: m }: { movimento: MovimentoContrato }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const labels = { video: 'Vídeo', foto: 'Fotos', outro: 'Outro', conferir: 'Conferir tipo' };
  async function salvar(patch: { ignorar_contrato: boolean; tipo_midia?: string | null }) {
    setBusy(true);
    try {
      const { error } = await (supabase as any).from('deliverables').update(patch).eq('id', m.id).select('id').single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['contrato-movimentos'] });
      toast.success(patch.ignorar_contrato ? 'Entrega ignorada no contrato' : 'Classificação salva');
    } catch { toast.error('Não foi possível salvar a classificação'); }
    finally { setBusy(false); }
  }
  return <div className="flex shrink-0 items-center gap-2">
    <select aria-label={`Tipo de ${m.titulo}`} className="max-w-full rounded-md border bg-background px-2 py-1.5 text-xs" value={m.ignorar_contrato ? 'ignorar' : m.tipo_midia || ''} disabled={busy} onChange={e => {
      const tipo = e.target.value;
      void salvar(tipo === 'ignorar' ? { ignorar_contrato: true } : { ignorar_contrato: false, tipo_midia: tipo || null });
    }}>
      <option value="">Automático: {labels[tipoMidia({ ...m, tipo_midia: null })]}</option>
      <option value="video">Vídeo</option><option value="foto">Fotos</option><option value="outro">Outro</option>
      <option value="ignorar">Ignorar no contrato</option>
    </select>
    {m.ignorar_contrato && <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" disabled={busy} onClick={() => salvar({ ignorar_contrato: false })}>Reincluir</button>}
  </div>;
}

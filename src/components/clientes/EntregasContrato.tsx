import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import type { MovimentoContrato } from '@/lib/consumoContrato';
import { tipoMidia } from '@/lib/midiaContrato';
import { linkProjeto } from '@/lib/projetoNavegacao';
import { statusLabel } from '@/lib/statusEntregavel';
import { balde, foraDoFechamento } from '@/lib/faturamentoBalde';
import ClassificarEntregaContrato from './ClassificarEntregaContrato';

type Props = { movimentos: MovimentoContrato[]; pendentes: number; clientId: string };
type Grupo = { projeto: MovimentoContrato['projetos'][number]; entregas: MovimentoContrato[]; diarias: MovimentoContrato[] };
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const contar = (n: number, singular: string, plural: string) => `${qtd(n)} ${n === 1 ? singular : plural}`;

export default function EntregasContrato({ movimentos, pendentes, clientId }: Props) {
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const grupos = new Map<string, Grupo>();
  for (const m of movimentos) {
    if (m.tipo === 'entrega' && m.tipo_registro && m.tipo_registro !== 'entregavel') continue;
    const projetos = m.projetos.length ? m.projetos : [{ id: 'sem-projeto', nome: 'Sem projeto' }];
    for (const projeto of projetos) {
      if (!grupos.has(projeto.id)) grupos.set(projeto.id, { projeto, entregas: [], diarias: [] });
      grupos.get(projeto.id)![m.tipo === 'entrega' ? 'entregas' : 'diarias'].push(m);
    }
  }
  const corresponde = (m: MovimentoContrato) => filtro === 'todos' ||
    (filtro === 'fee' && m.faturamento === 'mensal' && !m.ignorar_contrato) ||
    (filtro === 'fora' && m.faturamento !== 'mensal') ||
    (filtro === 'ignoradas' && m.ignorar_contrato) ||
    (filtro === 'pendentes' && m.tipo === 'entrega' && m.faturamento === 'mensal' && !m.ignorar_contrato && tipoMidia(m) === 'conferir');
  const termo = normalizar(busca.trim());
  const visiveis = [...grupos.values()].map(g => {
    const projetoEncontrado = normalizar(g.projeto.nome).includes(termo);
    const entregas = g.entregas.filter(m => corresponde(m) && (projetoEncontrado || normalizar(m.titulo).includes(termo)));
    const diarias = g.diarias.filter(m => corresponde(m) && projetoEncontrado);
    return { ...g, linhas: entregas, mostrar: entregas.length > 0 || diarias.length > 0 };
  }).filter(g => g.mostrar);

  return <section aria-label="Projetos e entregas do contrato" className="rounded-xl border">
    <div className="space-y-3 border-b p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Projetos e entregas <span className="ml-1 font-normal text-muted-foreground">{visiveis.length}</span></h3>
        <span className="text-xs text-muted-foreground">{pendentes ? `${pendentes} concluídas para classificar` : 'Registros da vigência'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Buscar entrega do contrato" placeholder="Buscar projeto ou entrega" className="h-9 min-w-40 flex-1 text-sm" value={busca} onChange={e => setBusca(e.target.value)} />
        <select aria-label="Filtrar entregas do contrato" className="h-9 rounded-md border bg-background px-2 text-xs" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="todos">Todos</option><option value="fee">No contrato</option><option value="fora">À parte</option><option value="pendentes">Sem classificação</option><option value="ignoradas">Ignoradas</option>
        </select>
      </div>
    </div>
    <div className="divide-y">{visiveis.map(g => {
      const expandido = aberto === g.projeto.id;
      const ignoradas = g.entregas.filter(m => m.ignorar_contrato).length;
      const realizadas = g.diarias.reduce((n, m) => n + Number(m.projetos.find(p => p.id === g.projeto.id)?.diarias_realizadas ?? m.quantidade_realizada ?? (m.status === 'realizada' ? m.quantidade : 0)), 0);
      return <div key={g.projeto.id}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4">
          <button type="button" aria-expanded={expandido} aria-controls={`projeto-contrato-${g.projeto.id}`} onClick={() => setAberto(expandido ? null : g.projeto.id)} className="flex min-w-0 basis-full items-center gap-2 rounded text-left sm:flex-1 sm:basis-0 focus-visible:outline focus-visible:outline-primary">
            {expandido ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0"><span className="block break-words text-sm font-medium">{g.projeto.nome}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{contar(g.entregas.length, 'entrega', 'entregas')} · {contar(realizadas, 'diária realizada', 'diárias realizadas')}{ignoradas > 0 ? ` · ${contar(ignoradas, 'ignorada', 'ignoradas')}` : ''}</span>
            </span>
          </button>
          {g.projeto.faturamento != null && <CobrancaProjeto projeto={g.projeto} />}
        </div>
        {expandido && <div id={`projeto-contrato-${g.projeto.id}`} className="border-t bg-muted/20 px-4 pb-3 sm:pl-10">
          <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <p className="text-xs text-muted-foreground">{foraDoFechamento(g.projeto.faturamento) ? 'Projeto à parte: nenhuma entrega consome o contrato.' : 'Ignorar retira a entrega do saldo e preserva sua cobrança.'}</p>
            {g.projeto.id !== 'sem-projeto' && <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" to={linkProjeto(g.projeto.id, `/clientes/${clientId}?aba=contrato`)}>Abrir projeto<ExternalLink className="h-3 w-3" /></Link>}
          </div>
          <div className="divide-y">{g.linhas.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0"><p className="break-words text-sm">{m.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabel(m.status)} · {m.faturamento !== 'mensal' ? 'À parte' : m.ignorar_contrato ? 'Ignorada' : 'No contrato'}</p></div>
            <ClassificarEntregaContrato movimento={m} />
          </div>)}</div>
          {!g.linhas.length && <p className="py-3 text-xs text-muted-foreground">Nenhuma entrega neste filtro.</p>}
          {g.diarias.some(m => m.projetos.length > 1) && <p className="pt-2 text-xs text-muted-foreground">Há captações compartilhadas. Cada data conta uma única vez no saldo geral.</p>}
        </div>}
      </div>;
    })}{!visiveis.length && <p className="p-4 text-sm text-muted-foreground">Nenhum projeto neste filtro.</p>}</div>
  </section>;
}

function CobrancaProjeto({ projeto }: { projeto: Grupo['projeto'] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function salvar(faturamento: string) {
    setBusy(true);
    try {
      const { error } = await (supabase as any).from('projects').update({ faturamento }).eq('id', projeto.id).select('id').single();
      if (error) throw error;
      await Promise.all(['contrato-movimentos', 'projects-client', 'projects', 'projeto', 'entregavel', 'deliverables', 'faturamento-mensal', 'faturamento_mensal'].map(k => qc.invalidateQueries({ queryKey: [k] })));
      toast.success(foraDoFechamento(faturamento) ? 'Projeto e todas as entregas fora do contrato' : 'Cobrança do projeto atualizada');
    } catch { toast.error('Não foi possível salvar a cobrança do projeto'); }
    finally { setBusy(false); }
  }
  return <select aria-label={`Faturamento de ${projeto.nome}`} className="h-9 w-full rounded-md border bg-background px-2 text-xs sm:w-auto" value={balde(projeto.faturamento)} disabled={busy} onChange={e => void salvar(e.target.value)}>
    <option value="mensal">Dentro do fee</option><option value="avulso">À parte · avulso</option><option value="mensal_separado">À parte · nota separada</option>
  </select>;
}

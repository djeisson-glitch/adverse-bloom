import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import type { MovimentoContrato } from '@/lib/consumoContrato';
import { tipoMidia } from '@/lib/midiaContrato';
import { linkProjeto } from '@/lib/projetoNavegacao';
import { statusLabel } from '@/lib/statusEntregavel';
import ClassificarEntregaContrato from './ClassificarEntregaContrato';

type Props = { movimentos: MovimentoContrato[]; pendentes: number; clientId: string };
export default function EntregasContrato({ movimentos, pendentes, clientId }: Props) {
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const entregas = movimentos.filter(m => m.tipo === 'entrega' && m.faturamento === 'mensal' && (!m.tipo_registro || m.tipo_registro === 'entregavel'));
  const ignoradas = entregas.filter(m => m.ignorar_contrato).length;
  const linhas = entregas.filter(m => (filtro === 'todos' || (filtro === 'ignoradas' ? m.ignorar_contrato : !m.ignorar_contrato && tipoMidia(m) === 'conferir')) &&
    `${m.titulo} ${m.projetos.map(p => p.nome).join(' ')}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  return <details className="rounded-lg border px-4 py-3">
    <summary className="cursor-pointer text-sm font-medium">Entregas <span className={pendentes ? 'ml-2 text-xs text-warning' : 'ml-2 text-xs text-muted-foreground'}>{pendentes ? `${pendentes} concluídas para classificar` : `${entregas.length} registros`}</span></summary>
    <div className="mt-3 flex flex-wrap gap-2">
      <Input aria-label="Buscar entrega do contrato" placeholder="Buscar entrega ou projeto" className="h-8 min-w-40 flex-1 text-xs" value={busca} onChange={e => setBusca(e.target.value)} />
      <select aria-label="Filtrar entregas do contrato" className="rounded-md border bg-background px-2 text-xs" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todas</option><option value="pendentes">Sem classificação</option><option value="ignoradas">Ignoradas ({ignoradas})</option></select>
    </div>
    <p className="my-2 text-xs text-muted-foreground">Ignorar retira do saldo, sem excluir a peça ou mudar sua cobrança.</p>
    <div className="max-h-80 divide-y overflow-y-auto">{linhas.length ? linhas.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0 flex-1"><p className="text-sm">{m.titulo}</p><div className="mt-1 text-xs text-muted-foreground">{m.ignorar_contrato ? 'Ignorada' : statusLabel(m.status)}{m.projetos.map(p => <Link key={p.id} className="ml-2 hover:text-primary" to={linkProjeto(p.id, `/clientes/${clientId}?aba=contrato`)}>{p.nome}</Link>)}</div></div>
      <ClassificarEntregaContrato movimento={m} />
    </div>) : <p className="py-4 text-xs text-muted-foreground">Nenhuma entrega neste filtro.</p>}</div>
  </details>;
}

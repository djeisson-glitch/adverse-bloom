import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileText, Pencil, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/format';
import { mesISO } from '@/lib/dataLocal';
import { Contrato, MovimentoContrato, limitesMes, resumoContrato } from '@/lib/consumoContrato';
import { linkProjeto } from '@/lib/projetoNavegacao';

const db = supabase as any;
const qtd = (n:number) => n.toLocaleString('pt-BR',{maximumFractionDigits:2});

export default function ContratoCliente({clientId}:{clientId:string}) {
  const [mes,setMes]=useState(mesISO().slice(0,7));
  const [editar,setEditar]=useState(false);
  const [filtro,setFiltro]=useState('todos');
  const contrato=useQuery<Contrato|null>({queryKey:['client_contratos',clientId],queryFn:async()=>{
    const {data,error}=await db.from('client_contratos').select('*').eq('client_id',clientId).eq('ativo',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error) throw error; return data;
  }});
  const c=contrato.data;
  const movimentos=useQuery<MovimentoContrato[]>({queryKey:['contrato-movimentos',c?.id,mes],staleTime:0,enabled:!!c,queryFn:async()=>{
    const {data,error}=await db.rpc('contrato_movimentos',{_contrato:c!.id,_ate:limitesMes(mes).fim});
    if(error) throw error; return data || [];
  }});
  if(contrato.isLoading) return <p className="p-4 text-sm">Carregando contrato…</p>;
  if(contrato.isError) return <div className="p-4 text-sm text-destructive">Não foi possível carregar o contrato. <Button variant="outline" onClick={()=>contrato.refetch()}>Tentar novamente</Button></div>;
  const resumo=c && movimentos.data ? resumoContrato(c,movimentos.data,mes):null;
  const linhas=resumo?.noMes.filter(m=>filtro==='todos'||(filtro==='fee'?m.faturamento==='mensal':m.faturamento!=='mensal')) || [];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{c?.nome || 'Contrato do cliente'}</h2><p className="text-xs text-muted-foreground">{c ? `${c.inicio?formatDate(c.inicio):'Início não informado'} → ${c.fim?formatDate(c.fim):'Sem data final'} · ${formatCurrency(c.valor_mensal)}/mês` : 'Cadastre a vigência, as franquias e as regras do contrato.'}</p></div>
      <Button variant="outline" onClick={()=>setEditar(!editar)}><Pencil className="mr-2 h-4 w-4"/>{editar?'Fechar edição':c?'Revisar contrato':'Configurar contrato'}</Button>
    </div>
    {(editar || !c) && <EditorContrato key={c?.id || clientId} clientId={clientId} contrato={c||null} onSaved={()=>setEditar(false)}/>}
    {c && <>
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="mes-contrato">Mês de referência</Label><Input id="mes-contrato" type="month" className="w-44" value={mes} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMes(e.target.value);}}/></div>
      {movimentos.isLoading && <p className="text-sm">Calculando consumo…</p>}
      {movimentos.isError && <div className="rounded-lg border border-destructive/40 p-4 text-sm">Não foi possível consultar o consumo. Nenhum saldo foi calculado. <Button variant="outline" onClick={()=>movimentos.refetch()}>Tentar novamente</Button></div>}
      {resumo && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <ConsumoCard titulo="Diárias de captação" mes={resumo.diarias} usadas={resumo.diariasJanela} limite={resumo.limiteDiarias} franquia={Number(c.diarias_mes)}/>
          <ConsumoCard titulo="Entregáveis" mes={resumo.entregas} usadas={resumo.entregasJanela} limite={resumo.limiteEntregas} franquia={Number(c.entregas_mes)}/>
        </div>
        <p className="text-xs text-muted-foreground">Saldo na janela de {formatDate(resumo.de)} a {formatDate(resumo.ate)} · {resumo.meses} mês(es) de franquia. {c.inicio ? `Desde o início até este mês: ${qtd(resumo.totalDiarias)} diárias e ${qtd(resumo.totalEntregas)} entregáveis no fee.`:'Informe o início para consultar o histórico completo.'}</p>
        <details className="rounded-lg border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Como o consumo é calculado</summary><p className="mt-2">Diárias incluem captações realizadas e programadas; canceladas não contam. Uma mesma data compartilhada entre projetos conta pela maior fração. Entregáveis contam pela data do projeto, seguindo o fechamento existente, mesmo ainda em produção. Cancelados e reprovados são excluídos. Exceções de cobrança da peça prevalecem sobre o projeto. Franquias são mensais, sem rateio de mês parcial. Regras específicas do documento ficam registradas abaixo para conferência.</p></details>
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3"><h3 className="text-sm font-semibold">Consumo e trabalhos à parte</h3><select aria-label="Filtrar cobrança do consumo" className="rounded-md bg-background p-2 text-xs" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todos</option><option value="fee">Dentro do fee</option><option value="fora">Faturados à parte</option></select></div>
          <div className="max-h-[460px] overflow-y-auto divide-y">{linhas.length ? linhas.map(m=><div key={`${m.tipo}-${m.id}`} className="space-y-1 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{m.tipo==='diaria'?`${qtd(m.quantidade)} diária(s) · captação`:m.titulo}</p><span className={`shrink-0 rounded px-2 py-1 text-[10px] ${m.faturamento==='mensal'?'bg-primary/10 text-primary':'bg-muted text-muted-foreground'}`}>{m.faturamento==='mensal'?'No fee':'À parte'}</span></div><p className="text-xs text-muted-foreground">{formatDate(m.data)} · {m.status.replace(/_/g,' ')}</p>{m.projetos.map(p=><Link key={p.id} className="mr-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to={linkProjeto(p.id,`/clientes/${clientId}?aba=contrato`)}>{p.nome}<ExternalLink className="h-3 w-3"/></Link>)}</div>):<p className="p-4 text-sm text-muted-foreground">Nenhum registro neste mês para este filtro.</p>}</div>
        </div>
      </>}
      {(c.escopo_entregas||c.observacoes) && <div className="rounded-lg border p-4 space-y-3">{c.escopo_entregas&&<div><h3 className="text-sm font-semibold">Entregas contratadas</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.escopo_entregas}</p></div>}{c.observacoes&&<div><h3 className="text-sm font-semibold">Regras do contrato</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.observacoes}</p></div>}</div>}
      {c.documento_path && <Button variant="outline" onClick={async()=>{const {data,error}=await db.storage.from('contratos-clientes').createSignedUrl(c.documento_path,60);if(error)toast.error('Não abriu o documento');else window.open(data.signedUrl,'_blank','noopener,noreferrer');}}><FileText className="mr-2 h-4 w-4"/>{c.documento_nome||'Abrir contrato'}</Button>}
    </>}
  </div>;
}

function ConsumoCard({titulo,mes,usadas,limite,franquia}:{titulo:string;mes:number;usadas:number;limite:number;franquia:number}) {
  const saldo=limite-usadas;
  return <div className="rounded-xl border bg-card p-4"><p className="text-sm font-medium">{titulo}</p><p className="mt-3 text-2xl font-semibold">{qtd(mes)} <span className="text-xs font-normal text-muted-foreground">no mês / {qtd(franquia)} contratadas</span></p><div className="mt-3 h-1.5 overflow-hidden rounded bg-muted"><div className={`h-full ${saldo<0?'bg-destructive':saldo===0?'bg-warning':'bg-success'}`} style={{width:`${limite>0?Math.min(100,usadas/limite*100):usadas>0?100:0}%`}}/></div><p className={`mt-2 text-sm ${saldo<0?'text-destructive':'text-muted-foreground'}`}>{saldo<0?`${qtd(-saldo)} excedentes`:`${qtd(saldo)} disponíveis`} na janela</p></div>;
}

function EditorContrato({clientId,contrato,onSaved}:{clientId:string;contrato:Contrato|null;onSaved:()=>void}) {
  const qc=useQueryClient();
  const [form,setForm]=useState<Record<string,any>>(()=>({nome:contrato?.nome||'Contrato mensal',inicio:contrato?.inicio||'',fim:contrato?.fim||'',valor_mensal:contrato?.valor_mensal??'',diarias_mes:contrato?.diarias_mes??'',entregas_mes:contrato?.entregas_mes??'',acumulo_meses:contrato?.acumulo_meses??1,observacoes:contrato?.observacoes||'',escopo_entregas:contrato?.escopo_entregas||'',documento_path:contrato?.documento_path||null,documento_nome:contrato?.documento_nome||null}));
  const [busy,setBusy]=useState('');
  const patch=(key:string,value:any)=>{setForm(f=>({...f,[key]:value}));};
  async function anexar(file?:File) {
    if(!file)return;
    if(!/\.(pdf|txt)$/i.test(file.name)||file.size>10*1024*1024)return toast.error('Use PDF ou TXT de até 10 MB');
    setBusy('upload');
    try {
      const path=`${clientId}/${crypto.randomUUID()}.${file.name.split('.').pop()!.toLowerCase()}`;
      const {error}=await db.storage.from('contratos-clientes').upload(path,file,{contentType:file.name.toLowerCase().endsWith('.pdf')?'application/pdf':'text/plain',upsert:false});
      if(error)throw error;
      setForm(f=>({...f,documento_path:path,documento_nome:file.name}));
      toast.success('Documento anexado. Preencha os dados do contrato e salve.');
    }catch(e:any){toast.error('Não anexou o contrato',{description:e.message});}finally{setBusy('');}
  }
  async function salvar(e:React.FormEvent) {
    e.preventDefault();
    setBusy('salvar');
    try {
      const {error}=await db.rpc('salvar_contrato_cliente',{_client:clientId,_dados:form});
      if(error)throw error;
      await Promise.all(['client_contratos','client_faturamento','contrato-movimentos'].map(k=>qc.invalidateQueries({queryKey:[k]})));
      toast.success('Contrato salvo');onSaved();
    }catch(e:any){toast.error('Não salvou o contrato',{description:e.message});}finally{setBusy('');}
  }
  return <form onSubmit={salvar} className="rounded-xl border bg-card p-4 space-y-4">
    <div className="rounded-lg border border-dashed p-3 space-y-2"><Label htmlFor="arquivo-contrato">Documento do contrato · PDF ou TXT, até 10 MB</Label><Input id="arquivo-contrato" type="file" accept=".pdf,.txt" disabled={!!busy} onChange={e=>anexar(e.target.files?.[0])}/>{form.documento_nome&&<p className="text-xs text-muted-foreground">{form.documento_nome}</p>}<p className="text-xs text-muted-foreground">Anexo para consulta. Preencha os campos manualmente; a leitura por IA está desativada.</p></div>
    <fieldset disabled={!!busy} className="grid gap-3 sm:grid-cols-2">{[
      ['nome','Nome do contrato','text'],['valor_mensal','Fee mensal (R$)','number'],['inicio','Início da vigência','date'],['fim','Fim da vigência (opcional)','date'],['diarias_mes','Diárias por mês','number'],['entregas_mes','Entregáveis por mês','number'],['acumulo_meses','Janela de acúmulo (meses)','number'],
    ].map(([key,label,type])=><div key={key}><Label htmlFor={`contrato-${key}`}>{label}</Label><Input id={`contrato-${key}`} type={type} value={form[key]} onChange={e=>patch(key,e.target.value)} required={key!=='fim'} min={type==='number'?(key==='acumulo_meses'?1:0):undefined} max={key==='acumulo_meses'?60:undefined} step={key==='valor_mensal'||key==='diarias_mes'?'0.01':1}/></div>)}</fieldset>
    <div><Label htmlFor="contrato-escopo">Entregas contratadas · tipos, formatos e quantidades</Label><Textarea id="contrato-escopo" disabled={!!busy} value={form.escopo_entregas} onChange={e=>patch('escopo_entregas',e.target.value)}/></div>
    <div><Label htmlFor="contrato-regras">Regras, prazos e observações</Label><Textarea id="contrato-regras" disabled={!!busy} rows={4} value={form.observacoes} onChange={e=>patch('observacoes',e.target.value)}/></div>
    <p className="text-xs text-muted-foreground">Salvar ativa o modelo de faturamento por contrato para este cliente. Cada mês da vigência libera a franquia integral; regras especiais permanecem para conferência.</p>
    <Button type="submit" disabled={!!busy}>{busy==='salvar'?'Salvando…':'Salvar contrato'}</Button>
  </form>;
}

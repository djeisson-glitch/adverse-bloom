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
import { calcularCreditos, tipoMidia, type ContaCredito } from '@/lib/creditosContrato';
import { hojeISO, mesISO } from '@/lib/dataLocal';
import { Contrato, MovimentoContrato, limitesMes, resumoContrato } from '@/lib/consumoContrato';
import VisaoGeralContrato from './VisaoGeralContrato';
import { execucaoContrato } from '@/lib/execucaoContrato';
import { linkProjeto } from '@/lib/projetoNavegacao';

const db = supabase as any;
const qtd = (n:number) => n.toLocaleString('pt-BR',{maximumFractionDigits:2});

export default function ContratoCliente({clientId}:{clientId:string}) {
  const [mes,setMes]=useState(mesISO().slice(0,7));
  const [dataCorte,setDataCorte]=useState('');
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
  const hoje=hojeISO();
  const historico=useQuery<MovimentoContrato[]>({queryKey:['contrato-movimentos',c?.id,'execucao',hoje],staleTime:0,enabled:!!c,queryFn:async()=>{
    const {data,error}=await db.rpc('contrato_movimentos',{_contrato:c!.id,_ate:hoje});
    if(error) throw error; return data || [];
  }});
  const execucao=c && historico.data ? execucaoContrato(c,historico.data,hoje):null;
  if(contrato.isLoading) return <p className="p-4 text-sm">Carregando contrato…</p>;
  if(contrato.isError) return <div className="p-4 text-sm text-destructive">Não foi possível carregar o contrato. <Button variant="outline" onClick={()=>contrato.refetch()}>Tentar novamente</Button></div>;
  const resumo=c && movimentos.data ? resumoContrato(c,movimentos.data,mes):null;
  const corte=dataCorte || (mes===hojeISO().slice(0,7)?hojeISO():limitesMes(mes).fim);
  const creditos=c?.validade_creditos_dias && movimentos.data ? calcularCreditos(c,movimentos.data,mes,corte) : null;
  const linhas=resumo?.noMes.filter(m=>filtro==='todos'||(filtro==='fee'?m.faturamento==='mensal':m.faturamento!=='mensal')) || [];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{c?.nome || 'Contrato do cliente'}</h2><p className="text-xs text-muted-foreground">{c ? `${c.inicio?formatDate(c.inicio):'Início não informado'} → ${c.fim?formatDate(c.fim):'Sem data final'} · ${formatCurrency(c.valor_mensal)}/mês` : 'Cadastre a vigência, as franquias e as regras do contrato.'}</p></div>
      <Button variant="outline" onClick={()=>setEditar(!editar)}><Pencil className="mr-2 h-4 w-4"/>{editar?'Fechar edição':c?'Revisar contrato':'Configurar contrato'}</Button>
    </div>
    {(editar || !c) && <EditorContrato key={c?.id || clientId} clientId={clientId} contrato={c||null} onSaved={()=>setEditar(false)}/>}
    {c && <>
      {historico.isLoading && <p className="text-sm">Calculando execução do contrato…</p>}
      {historico.isError && <div className="rounded-lg border border-destructive/40 p-4 text-sm">Não foi possível consultar a execução do contrato. <Button variant="outline" onClick={()=>historico.refetch()}>Tentar novamente</Button></div>}
      {execucao && <>
        <VisaoGeralContrato contrato={c} execucao={execucao} hoje={hoje}/>
        {!!execucao.pendentes.length && <details className="rounded-lg border border-warning/50 p-3 text-sm"><summary className="cursor-pointer">Total provisório: {execucao.pendentes.length} peça(s) concluída(s) sem tipo definido</summary><p className="my-2 text-xs text-muted-foreground">Estas peças já estão concluídas, mas ainda não foram descontadas. Confirme se são vídeos ou entregas de fotos para atualizar o total restante.</p>{execucao.pendentes.map(m=><div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><span>{m.titulo} · {formatDate(m.data)}</span><ClassificarMidia movimento={m}/></div>)}</details>}
      </>}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">Uso por mês e validade dos créditos</summary>
        <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="mes-contrato">Mês de referência</Label><Input id="mes-contrato" type="month" className="w-44" value={mes} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){setMes(e.target.value);setDataCorte('');}}}/></div>
      {movimentos.isLoading && <p className="text-sm">Calculando consumo…</p>}
      {movimentos.isError && <div className="rounded-lg border border-destructive/40 p-4 text-sm">Não foi possível consultar o consumo. Nenhum saldo foi calculado. <Button variant="outline" onClick={()=>movimentos.refetch()}>Tentar novamente</Button></div>}
      {resumo && <>
        {creditos ? <>
          <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="corte-contrato">Saldo em {corte > hojeISO() ? '(projeção)' : ''}</Label><Input id="corte-contrato" className="w-44" type="date" min={limitesMes(mes).inicio} max={limitesMes(mes).fim} value={corte} onChange={e=>{const v=e.target.value;if(!v || (v>=limitesMes(mes).inicio && v<=limitesMes(mes).fim))setDataCorte(v);}}/></div>
          <div className="grid gap-3 sm:grid-cols-2">{[{titulo:'Diárias',conta:creditos.diarias,usado:creditos.diariasMes},{titulo:'Entregas',conta:creditos.entregas,usado:creditos.entregasMes}].map(l=><div key={l.titulo} className="rounded-lg border p-3"><p className="text-sm font-medium">{l.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{qtd(l.usado)} no mês · {qtd(l.conta.saldo)} créditos disponíveis na data</p></div>)}</div>
          <p className="text-xs text-muted-foreground">Este controle de créditos inclui peças em produção e captações pela data marcada. Ele é separado da execução total concluída mostrada acima.</p>
          <p className="text-xs text-muted-foreground">Registros posteriores à data selecionada aparecem abaixo, mas ainda não descontam créditos.</p>
          {creditos.semInicio && <p className="text-sm text-warning">Informe o início do contrato para apurar créditos anteriores.</p>}
          {!!creditos.pendentes.length && c.franquia_entregas_tipo!=='todos' && <details className="rounded-lg border border-warning/50 p-3 text-sm"><summary className="cursor-pointer">Saldo provisório: {creditos.pendentes.length} peça(s) sem tipo definido no histórico</summary><p className="my-2 text-xs text-muted-foreground">Estas peças ainda não descontam a franquia de entregas. Confirme o tipo para recalcular.</p>{creditos.pendentes.map(m=><div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><span>{m.titulo} · {formatDate(m.data)}</span><ClassificarMidia movimento={m}/></div>)}</details>}
          <details className="rounded-lg border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Créditos por competência e regras do saldo</summary><p className="my-3">Cada competência libera a franquia no primeiro dia (ou no início da vigência, no mês inicial). Créditos expiram no início da data indicada, {c.validade_creditos_dias} dias após o primeiro dia da competência. O consumo usa os mais antigos primeiro. Teto de saldo: {c.limite_diarias_acumuladas ?? 'sem limite'} diárias e {c.limite_entregas_acumuladas ?? 'sem limite'} {c.franquia_entregas_tipo==='video'?'vídeos':'entregas'}; ao ultrapassar, o saldo mais antigo é retirado. Excedentes ficam separados e não são compensados por meses futuros. Captações programadas contam na data marcada; peças seguem a data do projeto. Itens à parte, cancelados e reprovados não consomem a franquia.</p><ExtratoCreditos titulo="Diárias" conta={creditos.diarias}/><ExtratoCreditos titulo={c.franquia_entregas_tipo==='video'?'Vídeos':'Entregas'} conta={creditos.entregas}/></details>
        </> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          <ConsumoCard titulo="Diárias de captação" mes={resumo.diarias} usadas={resumo.diariasJanela} limite={resumo.limiteDiarias} franquia={Number(c.diarias_mes)}/>
          <ConsumoCard titulo="Entregáveis" mes={resumo.entregas} usadas={resumo.entregasJanela} limite={resumo.limiteEntregas} franquia={Number(c.entregas_mes)}/>
        </div>
        <p className="text-xs text-muted-foreground">Saldo na janela de {formatDate(resumo.de)} a {formatDate(resumo.ate)} · {resumo.meses} mês(es) de franquia. {c.inicio ? `Desde o início até este mês: ${qtd(resumo.totalDiarias)} diárias e ${qtd(resumo.totalEntregas)} entregáveis no fee.`:'Informe o início para consultar o histórico completo.'}</p>
        <details className="rounded-lg border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Como o consumo é calculado</summary><p className="mt-2">Diárias incluem captações realizadas e programadas; canceladas não contam. Uma mesma data compartilhada entre projetos conta pela maior fração. Entregáveis contam pela data do projeto, seguindo o fechamento existente, mesmo ainda em produção. Cancelados e reprovados são excluídos. Exceções de cobrança da peça prevalecem sobre o projeto. Franquias são mensais, sem rateio de mês parcial. Regras específicas do documento ficam registradas abaixo para conferência.</p></details>
        </>}
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3"><h3 className="text-sm font-semibold">Consumo e trabalhos à parte</h3><select aria-label="Filtrar cobrança do consumo" className="rounded-md bg-background p-2 text-xs" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todos</option><option value="fee">Dentro do fee</option><option value="fora">Faturados à parte</option></select></div>
          <div className="max-h-[460px] overflow-y-auto divide-y">{linhas.length ? linhas.map(m=><div key={`${m.tipo}-${m.id}`} className="space-y-1 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{m.tipo==='diaria'?`${qtd(m.quantidade)} diária(s) · captação`:m.titulo}</p><span className={`shrink-0 rounded px-2 py-1 text-[10px] ${m.faturamento==='mensal'?'bg-primary/10 text-primary':'bg-muted text-muted-foreground'}`}>{m.faturamento==='mensal'?'No fee':'À parte'}</span></div><p className="text-xs text-muted-foreground">{formatDate(m.data)} · {m.status.replace(/_/g,' ')}{creditos && m.data>corte?' · após a data do saldo':''}</p>{creditos && m.tipo==='entrega' && <ClassificarMidia movimento={m}/>}{m.projetos.map(p=><Link key={p.id} className="mr-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to={linkProjeto(p.id,`/clientes/${clientId}?aba=contrato`)}>{p.nome}<ExternalLink className="h-3 w-3"/></Link>)}</div>):<p className="p-4 text-sm text-muted-foreground">Nenhum registro neste mês para este filtro.</p>}</div>
        </div>
      </>}
        </div>
      </details>
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
  const [form,setForm]=useState<Record<string,any>>(()=>({nome:contrato?.nome||'Contrato mensal',inicio:contrato?.inicio||'',fim:contrato?.fim||'',valor_mensal:contrato?.valor_mensal??'',diarias_mes:contrato?.diarias_mes??'',entregas_mes:contrato?.entregas_mes??'',acumulo_meses:contrato?.acumulo_meses??1,observacoes:contrato?.observacoes||'',escopo_entregas:contrato?.escopo_entregas||'',validade_creditos_dias:contrato?.validade_creditos_dias??'',limite_diarias_acumuladas:contrato?.limite_diarias_acumuladas??'',limite_entregas_acumuladas:contrato?.limite_entregas_acumuladas??'',franquia_entregas_tipo:contrato?.franquia_entregas_tipo||'todos',documento_path:contrato?.documento_path||null,documento_nome:contrato?.documento_nome||null}));
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
      ['nome','Nome do contrato','text'],['valor_mensal','Fee mensal (R$)','number'],['inicio','Início da vigência','date'],['fim','Fim da vigência (opcional)','date'],['diarias_mes','Diárias por mês','number'],['entregas_mes','Entregáveis por mês','number'],['acumulo_meses','Janela legada (meses, se não houver validade em dias)','number'],['validade_creditos_dias','Validade dos créditos (dias)','number'],['limite_diarias_acumuladas','Saldo máximo de diárias','number'],['limite_entregas_acumuladas','Saldo máximo de entregas','number'],
    ].map(([key,label,type])=><div key={key}><Label htmlFor={`contrato-${key}`}>{label}</Label><Input id={`contrato-${key}`} type={type} value={form[key]} onChange={e=>patch(key,e.target.value)} required={!['fim','validade_creditos_dias','limite_diarias_acumuladas','limite_entregas_acumuladas'].includes(key)} min={type==='number'?(['acumulo_meses','validade_creditos_dias'].includes(key)?1:0):undefined} max={key==='acumulo_meses'?60:key==='validade_creditos_dias'?3660:undefined} step={key==='valor_mensal'||key==='diarias_mes'||key==='limite_diarias_acumuladas'?'0.01':1}/></div>)}</fieldset>
    <div><Label htmlFor="franquia-tipo">O que desconta da franquia de entregas</Label><select id="franquia-tipo" disabled={!!busy} className="ml-2 rounded border bg-background p-2 text-sm" value={form.franquia_entregas_tipo} onChange={e=>patch('franquia_entregas_tipo',e.target.value)}><option value="todos">Todos os entregáveis</option><option value="video">Somente vídeos</option><option value="video_foto">Vídeos e entregas de fotos (franquia compartilhada)</option></select><p className="mt-1 text-xs text-muted-foreground">Com validade em dias, o saldo usa créditos por competência; a janela legada deixa de ser usada neste painel.</p></div>
    <div><Label htmlFor="contrato-escopo">Entregas contratadas · tipos, formatos e quantidades</Label><Textarea id="contrato-escopo" disabled={!!busy} value={form.escopo_entregas} onChange={e=>patch('escopo_entregas',e.target.value)}/></div>
    <div><Label htmlFor="contrato-regras">Regras, prazos e observações</Label><Textarea id="contrato-regras" disabled={!!busy} rows={4} value={form.observacoes} onChange={e=>patch('observacoes',e.target.value)}/></div>
    <p className="text-xs text-muted-foreground">Salvar ativa o modelo de faturamento por contrato para este cliente. Cada mês da vigência libera a franquia integral; regras especiais permanecem para conferência.</p>
    <Button type="submit" disabled={!!busy}>{busy==='salvar'?'Salvando…':'Salvar contrato'}</Button>
  </form>;
}

function ExtratoCreditos({titulo,conta}:{titulo:string;conta:ContaCredito}) {
  return <div className="my-3 overflow-x-auto"><h4 className="mb-2 font-semibold">{titulo}</h4><table className="w-full text-left"><thead><tr>{['Competência','Expira em','Liberado','Usado','Expirado','Retirado pelo teto','Disponível'].map(t=><th className="p-2" key={t}>{t}</th>)}</tr></thead><tbody>{conta.lotes.map(l=><tr key={l.competencia} className="border-t"><td className="p-2">{l.competencia.slice(5)}/{l.competencia.slice(0,4)}</td><td className="p-2">{formatDate(l.expiraEm)}</td>{[l.concedido,l.consumido,l.expirado,l.limitado,l.saldo].map((v,i)=><td className="p-2" key={i}>{qtd(v)}</td>)}</tr>)}</tbody></table></div>;
}
function ClassificarMidia({movimento:m}:{movimento:MovimentoContrato}) {
  const qc=useQueryClient();
  const [busy,setBusy]=useState(false);
  const labels={video:'Vídeo',foto:'Fotos',outro:'Outro',conferir:'Conferir tipo'};
  return <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">Tipo da peça<select aria-label={`Tipo de ${m.titulo}`} className="rounded border bg-background p-1" value={m.tipo_midia||''} disabled={busy} onChange={async e=>{
    const tipo=e.target.value||null;setBusy(true);
    try {const {error}=await db.from('deliverables').update({tipo_midia:tipo}).eq('id',m.id);if(error)throw error;await qc.invalidateQueries({queryKey:['contrato-movimentos']});toast.success('Tipo salvo; saldo recalculado');}catch {toast.error('Não foi possível salvar o tipo');}finally {setBusy(false);}
  }}><option value="">Automático: {labels[tipoMidia({...m,tipo_midia:null})]}</option><option value="video">Vídeo</option><option value="foto">Fotos</option><option value="outro">Outro</option></select></label>;
}

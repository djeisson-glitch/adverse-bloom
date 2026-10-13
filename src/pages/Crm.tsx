import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarClock, Check, Plus, Search, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useDeals, useProfiles } from "@/hooks/useDeals";
import { useCrmAgenda } from "@/hooks/useCrmAgenda";
import { agendaComercial, negocioAberto, negociosSemAtividade, prazoAtividade, type CrmActivity } from "@/lib/crm";
import { hojeISO } from "@/lib/dataLocal";
import { formatCurrency, formatDate } from "@/lib/format";
import { CrmNav } from "@/components/comercial/CrmNav";
import { CrmActivityDialog } from "@/components/comercial/CrmActivityDialog";
import { NovoLeadModal } from "@/components/leads/NovoLeadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const sourceLabel = {lead:"Contato com lead",task:"Atividade",followup:"Follow-up"};
const prazoLabel = {atrasado:"Atrasada",hoje:"Hoje",proximo:"Agendada",sem_data:"Sem data"};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Crm() {
  const {can} = usePermissions();
  const {user} = useAuth();
  const navigate = useNavigate();
  const dealQuery = useDeals(can("orcamentos"));
  const deals = can("orcamentos") ? dealQuery.deals : [];
  const {data:profiles=[]} = useProfiles();
  const agenda = useCrmAgenda();
  const today = hojeISO();
  const [owner,setOwner] = useState("all");
  const [period,setPeriod] = useState("urgentes");
  const [search,setSearch] = useState("");
  const [limit,setLimit] = useState(20);
  const [dealLimit,setDealLimit] = useState(5);
  const [leadOpen,setLeadOpen] = useState(false);
  const [dialog,setDialog] = useState<{activity?:CrmActivity;dealId?:string}|null>(null);
  const activities = useMemo(()=>agendaComercial(
    can("leads") ? agenda.leads.data || [] : [],
    can("orcamentos") ? agenda.tasks.data || [] : [],
    can("follow_ups") ? agenda.followups.data || [] : [], deals,
  ),[agenda.leads.data,agenda.tasks.data,agenda.followups.data,deals,can]);
  const owners = new Map(profiles.map(p=>[p.id,p.full_name || "Pessoa da equipe"]));
  const filtered = activities.filter(a=> {
    const target = owner === "me" ? user?.id : owner;
    return (owner === "all" || (owner === "none" ? !a.owner : a.owner === target))
      && normalize(`${a.title} ${a.context}`).includes(normalize(search));
  });
  const visible = filtered.filter(a=>period === "todos" || (period === "urgentes" ? a.due && a.due <= today : prazoAtividade(a.due,today) === period));
  const openDeals = deals.filter(d=>negocioAberto(d.stage));
  const unscheduled = negociosSemAtividade(deals, activities);
  const closeOverdue = openDeals.filter(d=>d.expected_close_date && d.expected_close_date < today);
  const sources = [
    ...(can("leads") ? [{name:"Leads",query:agenda.leads}] : []),
    ...(can("orcamentos") ? [{name:"Atividades",query:agenda.tasks},{name:"Negócios",query:dealQuery}] : []),
    ...(can("follow_ups") ? [{name:"Follow-ups",query:agenda.followups}] : []),
  ];
  const loading = sources.some(s=>s.query.isLoading);
  const failures = sources.filter(s=>s.query.isError);
  const canEvaluateNext = can("orcamentos") && can("follow_ups") && !agenda.tasks.isError && !agenda.followups.isError && !dealQuery.isError && !loading;
  const canEdit = (a:CrmActivity) => can(a.source === "lead" ? "leads" : a.source === "followup" ? "follow_ups" : "orcamentos","edit");
  const canOpen = (a:CrmActivity) => can(a.source === "lead" ? "leads" : a.dealId ? "orcamentos" : "follow_ups");
  const selectStyle = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return <div className="mx-auto max-w-[1400px] space-y-5 py-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-3xl font-semibold"><Target className="h-6 w-6 text-primary"/>CRM</h1><p className="mt-1 text-sm text-muted-foreground">Relacionamentos, negócios e próximos passos em um só lugar.</p></div>
      <div className="flex flex-wrap gap-2">{can("leads","edit") && <Button variant="outline" onClick={()=>setLeadOpen(true)}>Novo lead</Button>}{can("orcamentos","edit") && <Button onClick={()=>setDialog({})}><Plus className="mr-1.5 h-4 w-4"/>Nova atividade</Button>}</div>
    </header>
    <CrmNav/>
    {failures.length>0 && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm"><p>Não foi possível carregar: {failures.map(s=>s.name).join(", ")}. A visão está incompleta.</p><Button variant="ghost" size="sm" onClick={()=>sources.forEach(s=>void s.query.refetch())}>Tentar novamente</Button></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Atividades atrasadas" value={loading?"…":filtered.filter(a=>prazoAtividade(a.due,today)==="atrasado").length} note="Conforme os filtros da agenda" tone="text-destructive" onClick={()=>setPeriod("atrasado")}/>
      <Metric label="Para hoje" value={loading?"…":filtered.filter(a=>a.due===today).length} note="Próximos contatos e tarefas" onClick={()=>setPeriod("hoje")}/>
      <Metric label="Sem data" value={loading?"…":filtered.filter(a=>!a.due).length} note="Defina o próximo passo" tone="text-warning" onClick={()=>setPeriod("sem_data")}/>
      {can("orcamentos") ? <Metric label="Negócios em aberto" value={dealQuery.isLoading?"…":openDeals.length} note={`${formatCurrency(openDeals.reduce((s,d)=>s+(d.approved_value??d.value??0),0))} no funil · total da equipe`} onClick={()=>navigate("/crm/negocios")}/> : <Metric label="Atividades pendentes" value={loading?"…":filtered.length} note="Conforme os filtros da agenda" onClick={()=>setPeriod("todos")}/>}
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 rounded-xl border border-border bg-card" aria-label="Agenda comercial">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-medium"><CalendarClock className="h-4 w-4 text-primary"/>Agenda comercial</h2><span className="text-xs text-muted-foreground">{formatDate(today)}</span></div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[160px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input aria-label="Buscar na agenda" placeholder="Buscar contato ou negócio" className="h-9 pl-8" value={search} onChange={e=>{setSearch(e.target.value);setLimit(20);}}/></div>
            <select aria-label="Responsável da agenda" className={selectStyle+" max-w-full"} value={owner} onChange={e=>{setOwner(e.target.value);setLimit(20);}}><option value="all">Toda a equipe</option><option value="me">Minhas atividades</option><option value="none">Sem responsável</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || "Pessoa da equipe"}</option>)}</select>
            <select aria-label="Prazo da agenda" className={selectStyle} value={period} onChange={e=>{setPeriod(e.target.value);setLimit(20);}}><option value="urgentes">Hoje e atrasadas</option><option value="atrasado">Atrasadas</option><option value="hoje">Hoje</option><option value="proximo">Próximas</option><option value="sem_data">Sem data</option><option value="todos">Todas as pendentes</option></select>
          </div>
        </div>
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Carregando agenda…</p> : visible.length===0 ? <p className="p-8 text-center text-sm text-muted-foreground">{failures.length ? "Não há atividades nos dados disponíveis para este filtro." : "Nenhuma atividade neste filtro."}</p> : <ul className="divide-y divide-border/60">{visible.slice(0,limit).map(a=>{
          const prazo = prazoAtividade(a.due,today);
          return <li key={`${a.source}:${a.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0 flex-1 basis-56"><div className="mb-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground"><span>{sourceLabel[a.source]}</span><span className={prazo==="atrasado"?"text-destructive":prazo==="hoje"?"text-warning":""}>{prazoLabel[prazo]}{a.due && ` · ${formatDate(a.due)}`}</span></div><p className="break-words text-sm font-medium">{a.title}</p><p className="mt-1 break-words text-xs text-muted-foreground">{a.context}</p><p className="mt-1 text-xs text-muted-foreground">{a.owner ? owners.get(a.owner) || "Responsável cadastrado" : "Sem responsável"}</p></div>
            <div className="flex flex-wrap gap-1">{canOpen(a) && <Button variant="ghost" size="sm" asChild><Link to={a.href}>{a.source==="lead"?"Registrar contato":"Abrir"}<ArrowUpRight className="ml-1 h-3.5 w-3.5"/></Link></Button>}
              {a.source!=="lead" && canEdit(a) && <><Button variant="ghost" size="sm" onClick={()=>setDialog({activity:a})}>Editar</Button><Button variant="outline" size="sm" disabled={agenda.complete.isPending} onClick={()=>agenda.complete.mutate(a)} aria-label={`Concluir ${a.title}`}><Check className="mr-1 h-3.5 w-3.5"/>Concluir</Button></>}
            </div>
          </li>;
        })}</ul>}
        {visible.length>limit && <div className="p-3 text-center"><Button variant="ghost" onClick={()=>setLimit(n=>n+20)}>Mostrar mais ({visible.length-limit})</Button></div>}
      </section>
      <aside className="space-y-4">
        {canEvaluateNext && <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-medium">Sem próxima atividade <span className="text-muted-foreground">{unscheduled.length}</span></h2><p className="mt-1 text-xs text-muted-foreground">Negócios abertos sem tarefa ou follow-up com data. Visão da equipe.</p><div className="mt-3 space-y-3">{unscheduled.slice(0,dealLimit).map(d=><div key={d.id} className="border-t border-border/60 pt-3"><Link to={`/orcamentos/${d.id}`} className="block text-sm hover:text-primary">{d.title}</Link><p className="mt-1 text-xs text-muted-foreground">{d.client?.name || "Cliente a definir"}</p>{can("orcamentos","edit") && <Button className="mt-1 h-7 px-0 text-xs" variant="link" onClick={()=>setDialog({dealId:d.id})}>Agendar próximo passo</Button>}</div>)}{unscheduled.length===0 && <p className="text-sm text-muted-foreground">Todos têm um próximo passo agendado.</p>}{unscheduled.length>dealLimit && <Button variant="ghost" size="sm" onClick={()=>setDealLimit(n=>n+5)}>Mostrar mais ({unscheduled.length-dealLimit})</Button>}</div></section>}
        {can("orcamentos") && closeOverdue.length>0 && <section className="rounded-xl border border-warning/30 p-4"><h2 className="text-sm font-medium">Previsão de fechamento vencida · {closeOverdue.length}</h2><p className="mt-1 text-xs text-muted-foreground">Confira o andamento ou revise a data prevista.</p>{closeOverdue.slice(0,5).map(d=><Link key={d.id} to={`/orcamentos/${d.id}`} className="mt-3 block text-sm hover:text-primary">{d.title}<span className="mt-1 block text-xs text-muted-foreground">{formatDate(d.expected_close_date!)}</span></Link>)}</section>}
        <section className="rounded-xl border border-border p-4"><h2 className="mb-2 text-sm font-medium">Acessos rápidos</h2><div className="space-y-1">{([{module:"leads",to:"/leads",label:"Leads e histórico de contatos"},{module:"clientes",to:"/clientes",label:"Empresas e clientes"},{module:"demandas",to:"/demandas",label:"Demandas recebidas"},{module:"orcamentos",to:"/orcamentos",label:"Orçamentos e propostas"},{module:"follow_ups",to:"/follow-ups",label:"Calendário de follow-ups"}] as const).filter(l=>can(l.module)).map(l=><Link key={l.to} to={l.to} className="flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground">{l.label}<ArrowUpRight className="h-3.5 w-3.5"/></Link>)}</div></section>
      </aside>
    </div>
    {leadOpen && <NovoLeadModal aberto onFechar={()=>setLeadOpen(false)} onCriado={id=>navigate(`/leads/${id}`)}/>}
    {dialog && <CrmActivityDialog {...dialog} deals={deals} profiles={profiles} onClose={()=>setDialog(null)} onSaved={agenda.refresh}/>}
  </div>;
}
function Metric({label,value,note,tone="",onClick}:{label:string;value:string|number;note:string;tone?:string;onClick:()=>void}) {
  return <button onClick={onClick} className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{note}</p></button>;
}

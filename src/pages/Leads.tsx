import { useMemo, useState } from "react";
import { hojeISO } from "@/lib/dataLocal";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sprout, Plus, Flame, Snowflake, Thermometer, CalendarClock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NovoLeadModal } from "@/components/leads/NovoLeadModal";

export const TEMPERATURAS = [
  { v: "frio", l: "Frio", chip: "bg-sky-500/15 text-info" },
  { v: "morno", l: "Morno", chip: "bg-amber-500/15 text-warning" },
  { v: "quente", l: "Quente", chip: "bg-destructive/15 text-destructive" },
];
export const STATUSES = [
  { v: "novo", l: "Novo" },
  { v: "em_nutricao", l: "Em nutrição" },
  { v: "qualificado", l: "Qualificado" },
  { v: "convertido", l: "Convertido" },
  { v: "descartado", l: "Descartado" },
];
export const ORIGENS = [
  { v: "outbound", l: "Outbound" },
  { v: "indicacao", l: "Indicação" },
  { v: "site", l: "Site" },
  { v: "redes", l: "Redes sociais" },
  { v: "evento", l: "Evento" },
  { v: "outro", l: "Outro" },
];

const tempChip = (t: string) => TEMPERATURAS.find((x) => x.v === t)?.chip || "bg-muted text-muted-foreground";
const label = (arr: { v: string; l: string }[], v: string) => arr.find((x) => x.v === v)?.l || v;

export default function Leads() {
  const navigate = useNavigate();
  const hoje = hojeISO();

  const [fTemp, setFTemp] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [modal, setModal] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("*, ultima:lead_interacoes(data)")
        .order("proximo_toque", { nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtrados = useMemo(
    () =>
      leads.filter(
        (l) => (fTemp === "all" || l.temperatura === fTemp) && (fStatus === "all" || l.status === fStatus),
      ),
    [leads, fTemp, fStatus],
  );

  const kpis = useMemo(() => {
    const ativos = leads.filter((l) => !["convertido", "descartado"].includes(l.status));
    return {
      total: ativos.length,
      quentes: ativos.filter((l) => l.temperatura === "quente").length,
      mornos: ativos.filter((l) => l.temperatura === "morno").length,
      atrasados: ativos.filter((l) => l.proximo_toque && l.proximo_toque < hoje).length,
    };
  }, [leads, hoje]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Sprout className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">Nutrição pré-funil — mantenha quente até virar orçamento.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Em nutrição" value={kpis.total} icon={Sprout} />
        <Kpi label="Quentes" value={kpis.quentes} icon={Flame} tone="text-destructive" />
        <Kpi label="Mornos" value={kpis.mornos} icon={Thermometer} tone="text-warning" />
        <Kpi label="Toque atrasado" value={kpis.atrasados} icon={CalendarClock} tone={kpis.atrasados > 0 ? "text-destructive" : "text-success"} />
      </div>

      {/* O cadastro virou MODAL: a barra pedia só nome, empresa, origem e
          temperatura, e e-mail/celular ficavam pra depois — que na prática é
          nunca. Lead sem contato é um nome numa lista. */}
      <div className="flex justify-end">
        <Button onClick={() => setModal(true)} className="bg-primary text-primary-foreground">
          <Plus className="mr-1 h-4 w-4" /> Novo lead
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={fTemp} onValueChange={setFTemp}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Temperatura" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda temperatura</SelectItem>
            {TEMPERATURAS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1.6fr_110px_130px_120px_40px] gap-2 border-b border-border/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Lead</span><span>Origem</span><span>Temperatura</span><span>Próximo toque</span><span />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {leads.length === 0 ? "Nenhum lead ainda. Clique em Novo lead pra cadastrar o primeiro." : "Nenhum lead com esses filtros."}
            </div>
          ) : (
            filtrados.map((l) => {
              const atrasado = l.proximo_toque && l.proximo_toque < hoje && !["convertido", "descartado"].includes(l.status);
              return (
                <div
                  key={l.id}
                  onClick={() => navigate(`/leads/${l.id}`)}
                  className="grid cursor-pointer grid-cols-[1.6fr_110px_130px_120px_40px] items-center gap-2 border-b border-border/30 px-5 py-3 text-sm last:border-0 hover:bg-sidebar-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{l.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.empresa || "—"} · {label(STATUSES, l.status)}
                      {l.motivo_toque ? ` · ${l.motivo_toque}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{label(ORIGENS, l.origem)}</span>
                  <span><span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${tempChip(l.temperatura)}`}>{label(TEMPERATURAS, l.temperatura)}</span></span>
                  <span className={`text-xs ${atrasado ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                    {l.proximo_toque ? new Date(l.proximo_toque + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
                  </span>
                  <Snowflake className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <NovoLeadModal
        aberto={modal}
        onFechar={() => setModal(false)}
        onCriado={(id) => { setModal(false); navigate(`/leads/${id}`); }}
      />
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="space-y-1 p-4">
        <Icon className={`h-4 w-4 ${tone || "text-primary"}`} />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${tone || "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

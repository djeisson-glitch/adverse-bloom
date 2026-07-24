import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Video,
  Plus,
  MapPin,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  Pencil,
  X,
  CalendarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveTeamMembers } from "@/hooks/useTeamMembers";
import {
  useSaidasProducao,
  useSalvarSaida,
  useCancelarSaida,
  useGcalStatus,
  useSyncTodas,
  TIPO_SAIDA_META,
  STATUS_SAIDA_META,
  type SaidaProducao,
  type TipoSaida,
} from "@/hooks/useSaidasProducao";

const TIPOS: TipoSaida[] = ["diaria", "visita_tecnica", "saida"];

function rotuloDia(dataStr: string): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = Math.round((dt.getTime() - hoje.getTime()) / 86400000);
  const base = dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  if (diff === 0) return `Hoje · ${base}`;
  if (diff === 1) return `Amanhã · ${base}`;
  if (diff === -1) return `Ontem · ${base}`;
  return base;
}

function horaFmt(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function iniciais(nome: string): string {
  return nome.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ------- Sync badge -------
function SyncBadge({ saida }: { saida: SaidaProducao }) {
  if (saida.status === "cancelada") return null;
  const s = saida.gcal_sync_status;
  if (saida.gcal_event_id && s === "ok")
    return (
      <span className="flex items-center gap-1 text-[11px] text-success" title="Publicado no Google Agenda">
        <CheckCircle2 className="h-3.5 w-3.5" /> Google
      </span>
    );
  if (s === "erro")
    return (
      <span className="flex items-center gap-1 text-[11px] text-destructive" title="Falha ao publicar — sincronize de novo">
        <AlertCircle className="h-3.5 w-3.5" /> Erro
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Ainda não publicado no Google">
      <CircleDashed className="h-3.5 w-3.5" /> Pendente
    </span>
  );
}

// ------- Página -------
export default function AgendaProducao() {
  const { data: saidas = [], isLoading } = useSaidasProducao();
  const { data: membros = [] } = useActiveTeamMembers();
  const { data: gcal } = useGcalStatus();
  const salvar = useSalvarSaida();
  const cancelar = useCancelarSaida();
  const syncTodas = useSyncTodas();

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("projects").select("id, name").order("name");
      return (data || []) as { id: string; name: string }[];
    },
  });

  const membroNome = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    membros.forEach((m) => map.set(m.id, { name: m.name, color: m.color }));
    return map;
  }, [membros]);

  const [filtroTipo, setFiltroTipo] = useState<TipoSaida | "todos">("todos");
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [editando, setEditando] = useState<Partial<SaidaProducao> | null>(null);

  const visiveis = useMemo(() => {
    return saidas.filter(
      (s) =>
        (filtroTipo === "todos" || s.tipo === filtroTipo) &&
        (mostrarCanceladas || s.status !== "cancelada"),
    );
  }, [saidas, filtroTipo, mostrarCanceladas]);

  const porDia = useMemo(() => {
    const map = new Map<string, SaidaProducao[]>();
    visiveis.forEach((s) => map.set(s.data, [...(map.get(s.data) || []), s]));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visiveis]);

  async function handleSyncTodas() {
    try {
      const r = await syncTodas.mutateAsync();
      toast.success(`${r.sincronizadas} saída(s) publicada(s) no Google${r.erros ? ` · ${r.erros} com erro` : ""}`);
    } catch (e: any) {
      toast.error("Falha ao sincronizar: " + (e?.message || e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Video className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Saídas de produção</h1>
            <p className="text-sm text-muted-foreground">
              Diárias, visitas técnicas e saídas — publicadas no calendário{" "}
              <span className="text-foreground">Gravações | Adverse</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSyncTodas} disabled={syncTodas.isPending || !gcal?.configured}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncTodas.isPending ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          <Button size="sm" onClick={() => setEditando({ tipo: "diaria", dia_inteiro: false, equipe: [] })}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova saída
          </Button>
        </div>
      </div>

      {/* Estado da conexão Google */}
      {gcal && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            gcal.configured
              ? "border-emerald-500/30 bg-emerald-500/5 text-success"
              : "border-warning/30 bg-warning/5 text-warning"
          }`}
        >
          {gcal.configured ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Conectado — cada saída aparece automaticamente no Google Agenda do time.
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              Google ainda não conectado. As saídas ficam salvas no OS e serão publicadas assim que a conta de serviço for configurada.
            </>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={filtroTipo === "todos" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFiltroTipo("todos")}
        >
          Todas
        </Button>
        {TIPOS.map((t) => (
          <Button
            key={t}
            variant={filtroTipo === t ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFiltroTipo(t)}
          >
            {TIPO_SAIDA_META[t].emoji} {TIPO_SAIDA_META[t].label}
          </Button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={mostrarCanceladas} onCheckedChange={setMostrarCanceladas} />
          Mostrar canceladas
        </label>
      </div>

      {/* Agenda */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : porDia.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarOff className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma saída agendada.</p>
            <Button variant="outline" size="sm" onClick={() => setEditando({ tipo: "diaria", dia_inteiro: false, equipe: [] })}>
              <Plus className="mr-1.5 h-4 w-4" /> Agendar a primeira
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {porDia.map(([dia, itens]) => (
            <div key={dia} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase capitalize tracking-wider text-muted-foreground">
                {rotuloDia(dia)}
              </h3>
              <div className="space-y-2">
                {itens.map((s) => {
                  const meta = TIPO_SAIDA_META[s.tipo];
                  const stat = STATUS_SAIDA_META[s.status];
                  const resp = s.responsavel_id ? membroNome.get(s.responsavel_id) : null;
                  const cancelada = s.status === "cancelada";
                  return (
                    <Card key={s.id} className={`glass-card overflow-hidden ${cancelada ? "opacity-60" : ""}`}>
                      <div className="flex">
                        <div className="w-1 shrink-0" style={{ background: meta.color }} />
                        <CardContent className="flex-1 space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={`text-sm font-medium text-foreground ${cancelada ? "line-through" : ""}`}>
                                {meta.emoji} {s.titulo}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {s.dia_inteiro || !s.hora_inicio
                                    ? "Dia inteiro"
                                    : `${horaFmt(s.hora_inicio)}${s.hora_fim ? `–${horaFmt(s.hora_fim)}` : ""}`}
                                </span>
                                {s.local && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {s.local}
                                  </span>
                                )}
                                {s.project?.name && (
                                  <Link
                                    to={s.project_id ? `/projetos/${s.project_id}` : "#"}
                                    className="text-primary hover:underline"
                                  >
                                    {s.project.name}
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <SyncBadge saida={s} />
                              <Badge variant="outline" className={`text-[10px] ${stat.className}`}>
                                {stat.label}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            {/* Equipe */}
                            <div className="flex items-center gap-1">
                              {resp && (
                                <span
                                  className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-primary/50"
                                  style={{ background: resp.color }}
                                  title={`Responsável: ${resp.name}`}
                                >
                                  {iniciais(resp.name)}
                                </span>
                              )}
                              {(s.equipe || [])
                                .filter((id) => id !== s.responsavel_id)
                                .map((id) => {
                                  const m = membroNome.get(id);
                                  if (!m) return null;
                                  return (
                                    <span
                                      key={id}
                                      className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                                      style={{ background: m.color }}
                                      title={m.name}
                                    >
                                      {iniciais(m.name)}
                                    </span>
                                  );
                                })}
                            </div>
                            {!cancelada && (
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(s)}>
                                  <Pencil className="mr-1 h-3 w-3" /> Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    if (confirm("Cancelar esta saída? Ela também é removida do Google Agenda.")) {
                                      cancelar.mutate(s.id);
                                    }
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <SaidaDialog
          saida={editando}
          membros={membros}
          projetos={projetos}
          onClose={() => setEditando(null)}
          onSalvar={async (dados) => {
            try {
              await salvar.mutateAsync(dados);
              toast.success(
                gcal?.configured
                  ? "Saída salva e publicada no Google Agenda."
                  : "Saída salva. (Google ainda não conectado.)",
              );
              setEditando(null);
            } catch (e: any) {
              toast.error("Erro ao salvar: " + (e?.message || e));
            }
          }}
          salvando={salvar.isPending}
        />
      )}
    </div>
  );
}

// ------- Dialog de criar/editar -------
function SaidaDialog({
  saida,
  membros,
  projetos,
  onClose,
  onSalvar,
  salvando,
}: {
  saida: Partial<SaidaProducao>;
  membros: { id: string; name: string; color: string }[];
  projetos: { id: string; name: string }[];
  onClose: () => void;
  onSalvar: (dados: Partial<SaidaProducao> & { titulo: string; data: string; tipo: TipoSaida }) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<TipoSaida>((saida.tipo as TipoSaida) || "diaria");
  const [titulo, setTitulo] = useState(saida.titulo || "");
  const [projectId, setProjectId] = useState<string | null>(saida.project_id || null);
  const [data, setData] = useState(saida.data || new Date().toISOString().slice(0, 10));
  const [diaInteiro, setDiaInteiro] = useState(!!saida.dia_inteiro);
  const [horaInicio, setHoraInicio] = useState(saida.hora_inicio?.slice(0, 5) || "08:00");
  const [horaFim, setHoraFim] = useState(saida.hora_fim?.slice(0, 5) || "");
  const [local, setLocal] = useState(saida.local || "");
  const [responsavelId, setResponsavelId] = useState<string | null>(saida.responsavel_id || null);
  const [equipe, setEquipe] = useState<string[]>(saida.equipe || []);
  const [obs, setObs] = useState(saida.observacoes || "");

  const toggleMembro = (id: string) =>
    setEquipe((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const submit = () => {
    if (!titulo.trim()) return toast.error("Dá um título pra saída.");
    if (!data) return toast.error("Escolhe a data.");
    onSalvar({
      id: saida.id,
      tipo,
      titulo: titulo.trim(),
      project_id: projectId,
      data,
      dia_inteiro: diaInteiro,
      hora_inicio: diaInteiro ? null : `${horaInicio}:00`,
      hora_fim: diaInteiro || !horaFim ? null : `${horaFim}:00`,
      local: local.trim() || null,
      responsavel_id: responsavelId,
      equipe,
      observacoes: obs.trim() || null,
      status: (saida.status as any) || "agendada",
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{saida.id ? "Editar saída" : "Nova saída de produção"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoSaida)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_SAIDA_META[t].emoji} {TIPO_SAIDA_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={
                tipo === "diaria" ? "Ex.: Diária — SLC Cruz Alta" : tipo === "visita_tecnica" ? "Ex.: Visita técnica — locação centro" : "Ex.: Captação de apoio"
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Projeto (opcional)</Label>
            <Select value={projectId ?? "none"} onValueChange={(v) => setProjectId(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem projeto</SelectItem>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
            <Label className="cursor-pointer">Dia inteiro</Label>
            <Switch checked={diaInteiro} onCheckedChange={setDiaInteiro} />
          </div>
          {!diaInteiro && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fim (opcional)</Label>
                <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Endereço ou nome da locação" />
          </div>

          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={responsavelId ?? "none"} onValueChange={(v) => setResponsavelId(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguém</SelectItem>
                {membros.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipe na saída</Label>
            <div className="flex flex-wrap gap-1.5">
              {membros.map((m) => {
                const on = equipe.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMembro(m.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    {m.name}
                  </button>
                );
              })}
              {membros.length === 0 && (
                <p className="text-xs text-muted-foreground">Cadastre o time em Time / Fornecedores.</p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quem sai de produção fica indisponível pra edição naquele dia — é isso que desconta as horas do editor/câmera.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Equipamento, ponto de encontro, contato no local…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={salvando}>
            {salvando ? "Salvando…" : saida.id ? "Salvar" : "Agendar saída"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

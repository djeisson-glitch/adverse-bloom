import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { UsersRound, Plus, Save, Check, ChevronDown, MailCheck, X, Info, UserMinus, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

/**
 * Cadastrar = CONVIDAR. Não criamos usuário nem senha: o login é só com Google.
 * O convite libera o e-mail e guarda a ficha (papel, funções, custo); no 1º
 * login com Google um trigger provisiona o profile + papel automaticamente.
 */

const PAPEIS: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Acesso total, vê valores em R$" },
  { value: "produtor", label: "Produtor", hint: "Coordena produção, vê valores" },
  { value: "equipe", label: "Equipe", hint: "Aponta horas, não vê R$" },
  { value: "edicao", label: "Edição", hint: "Time de pós — capacidade produtiva" },
  { value: "cliente", label: "Cliente", hint: "Só o próprio portal" },
];

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  funcao: string | null;
  funcao_id: string | null;
  funcoes: string[] | null;
  custo_hora: number | null;
  horas_semana: number;
  ativo: boolean;
};

type RateCard = {
  id: string;
  funcao: string;
  preco_hora: number;
  custo_hora: number;
  ativo: boolean;
};

type UserRole = { id: string; user_id: string; role: string };

export default function Time() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { isAdmin } = usePermissions();

  const [novo, setNovo] = useState({
    nome: "",
    email: "",
    funcoes: [] as string[],
    papel: "equipe",
    horas_semana: 40,
    custo_hora: "" as string,
  });
  const [criando, setCriando] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["team-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data as unknown as Profile[];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["team-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data as UserRole[];
    },
  });

  const { data: rateCard = [] } = useQuery({
    queryKey: ["rate-card"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("rate_card")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as RateCard[];
    },
  });

  const getRole = (userId: string) => roles.find((r) => r.user_id === userId)?.role || "equipe";

  // Convites pendentes: e-mail liberado, mas a pessoa ainda não entrou.
  const { data: convites = [] } = useQuery({
    queryKey: ["team-convites"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("allowed_emails")
        .select("email, nome, papel, funcoes, horas_semana, custo_hora, usado_em, created_at")
        .is("usado_em", null)
        .order("created_at", { ascending: false });
      if (error) return [] as any[];   // tabela/coluna ainda sem migration: não quebra a tela
      return data as any[];
    },
  });

  // Convidar = cadastrar. Não cria usuário nem senha — o login é só com Google.
  const convidar = async () => {
    if (!novo.nome || !novo.email) {
      toast.error("Preencha nome e e-mail");
      return;
    }
    setCriando(true);
    try {
      const primeira = novo.funcoes[0] || null;
      const funcaoObj = rateCard.find((r) => r.funcao === primeira);
      const { data, error } = await (supabase as any).rpc("admin_convidar_membro", {
        _email: novo.email,
        _nome: novo.nome,
        _funcao: primeira,
        _funcao_id: funcaoObj?.id || null,
        _funcoes: novo.funcoes,
        _papel: novo.papel,
        _horas: novo.horas_semana,
        _custo: novo.custo_hora ? Number(novo.custo_hora) : funcaoObj?.custo_hora || null,
      });
      if (error) throw error;

      toast.success(data?.ja_entrou ? "Membro atualizado" : "Convite enviado", {
        description: data?.ja_entrou
          ? "Essa pessoa já tinha entrado — atualizei o perfil dela."
          : `${novo.email} já pode entrar com o Google. O perfil é criado no primeiro login.`,
      });
      setNovo({ nome: "", email: "", funcoes: [], papel: "equipe", horas_semana: 40, custo_hora: "" });
      qc.invalidateQueries({ queryKey: ["team-profiles"] });
      qc.invalidateQueries({ queryKey: ["team-roles"] });
      qc.invalidateQueries({ queryKey: ["team-convites"] });
    } catch (e: any) {
      toast.error("Erro ao convidar", {
        description: /admin_convidar_membro|function|does not exist|column/i.test(e.message || "")
          ? "Rode 'supabase db push' pra habilitar os convites."
          : e.message,
      });
    } finally {
      setCriando(false);
    }
  };

  const cancelarConvite = async (email: string) => {
    const { error } = await (supabase as any).rpc("admin_remover_convite", { _email: email });
    if (error) return toast.error("Não deu pra cancelar", { description: error.message });
    toast.success("Convite cancelado");
    qc.invalidateQueries({ queryKey: ["team-convites"] });
  };

  // Tirar alguém do sistema. Revogar = seguro (preserva horas). Excluir = só
  // se a pessoa nunca apontou hora (o banco recusa se tiver histórico).
  const acaoMembro = useMutation({
    mutationFn: async ({ acao, uid, papel }: { acao: "desativar" | "reativar" | "excluir"; uid: string; papel?: string }) => {
      const rpc =
        acao === "desativar" ? "admin_desativar_membro"
        : acao === "reativar" ? "admin_reativar_membro"
        : "admin_excluir_membro";
      const args: any = { _uid: uid };
      if (acao === "reativar") args._papel = papel || "equipe";
      const { error } = await (supabase as any).rpc(rpc, args);
      if (error) throw error;
      return acao;
    },
    onSuccess: (acao) => {
      qc.invalidateQueries({ queryKey: ["team-profiles"] });
      qc.invalidateQueries({ queryKey: ["team-roles"] });
      qc.invalidateQueries({ queryKey: ["team-convites"] });
      toast.success(
        acao === "desativar" ? "Acesso revogado" : acao === "reativar" ? "Acesso devolvido" : "Membro excluído",
        acao === "desativar" ? { description: "O histórico de horas foi preservado." } : undefined,
      );
    },
    onError: (e: any) => {
      const msg = e.message || "";
      toast.error("Não deu", {
        description: /admin_desativar_membro|admin_excluir_membro|function|does not exist/i.test(msg)
          ? "Rode 'supabase db push' pra habilitar."
          : msg.replace(/^.*?:\s*/, ""),   // tira o prefixo técnico do erro do Postgres
      });
    },
  });

  const salvarPerfil = useMutation({
    mutationFn: async (p: Profile & { papel: string; funcoes: string[] }) => {
      const primeira = p.funcoes[0] || null;
      const funcaoObj = rateCard.find((r) => r.funcao === primeira);
      const { error } = await (supabase as any).rpc("admin_upsert_membro", {
        _uid: p.id,
        _email: p.email,
        _nome: p.full_name,
        _funcao: primeira,
        _funcao_id: funcaoObj?.id || null,
        _funcoes: p.funcoes,
        _papel: p.papel,
        _horas: p.horas_semana,
        _custo: p.custo_hora,
        _ativo: p.ativo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-profiles"] });
      qc.invalidateQueries({ queryKey: ["team-roles"] });
      toast.success("Salvo");
    },
    onError: (e: any) =>
      toast.error("Erro ao salvar", {
        description: /admin_upsert_membro|function|does not exist/i.test(e.message || "")
          ? "Rode 'supabase db push' pra habilitar."
          : e.message,
      }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <UsersRound className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Time</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro da equipe e acompanhamento do apontamento de horas (semana atual).
          </p>
        </div>
      </div>

      {/* Convite (= cadastro). Sem senha: o login é só com Google. */}
      {isAdmin && (
        <Card className="glass-card">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                Cadastrar aqui <strong>convida</strong> a pessoa: não criamos senha (o login é só com Google).
                Use o <strong>e-mail da conta Google</strong> que ela vai usar pra entrar — o perfil (papel, funções, custo)
                é aplicado sozinho no primeiro login.
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Nome"
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              />
              <Input
                placeholder="E-mail da conta Google"
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
              />
              <MultiFuncao
                rateCard={rateCard}
                value={novo.funcoes}
                onChange={(v) => setNovo({ ...novo, funcoes: v })}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Select value={novo.papel} onValueChange={(v) => setNovo({ ...novo, papel: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label} — <span className="text-muted-foreground">{p.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={novo.horas_semana}
                  onChange={(e) => setNovo({ ...novo, horas_semana: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">h/sem</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="custo/h"
                  value={novo.custo_hora}
                  onChange={(e) => setNovo({ ...novo, custo_hora: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">R$/h</span>
              </div>
              <Button onClick={convidar} disabled={criando} className="bg-primary text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" />
                {criando ? "Convidando..." : "Convidar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Convites pendentes: liberados, mas ainda não entraram */}
      {isAdmin && convites.length > 0 && (
        <Card className="glass-card">
          <CardContent className="p-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MailCheck className="h-4 w-4 text-primary" /> Aguardando 1º login
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Já podem entrar com o Google. O perfil aparece na lista abaixo assim que entrarem pela primeira vez.
            </p>
            <div className="mt-3 space-y-1.5">
              {convites.map((c: any) => (
                <div key={c.email} className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{c.nome || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  </div>
                  <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                    {PAPEIS.find((p) => p.value === c.papel)?.label || c.papel}
                  </span>
                  <button
                    onClick={() => cancelarConvite(c.email)}
                    title="Cancelar convite"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards por pessoa */}
      <div className="space-y-3">
        {profiles.map((p) => (
          <TeamMemberRow
            key={p.id}
            profile={p}
            currentRole={getRole(p.id)}
            rateCard={rateCard}
            editable={isAdmin || p.id === me?.id}
            adminActions={isAdmin}
            podeRemover={isAdmin && p.id !== me?.id}
            onSave={(patch) => salvarPerfil.mutate({ ...p, ...patch })}
            onAcao={(acao, papel) => acaoMembro.mutate({ acao, uid: p.id, papel })}
            processando={acaoMembro.isPending && acaoMembro.variables?.uid === p.id}
          />
        ))}
        {profiles.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
            Nenhum membro cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function MultiFuncao({
  rateCard, value, onChange,
}: {
  rateCard: RateCard[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (f: string) =>
    onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  const label = value.length === 0 ? "Função" : value.length === 1 ? value[0] : `${value.length} funções`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm">
          <span className={`truncate ${value.length ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {rateCard.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Cadastre funções no rate card primeiro.</p>
        ) : (
          rateCard.map((r) => {
            const on = value.includes(r.funcao);
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.funcao)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                {r.funcao}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

function TeamMemberRow({
  profile,
  currentRole,
  rateCard,
  editable,
  adminActions,
  podeRemover,
  onSave,
  onAcao,
  processando,
}: {
  profile: Profile;
  currentRole: string;
  rateCard: RateCard[];
  editable: boolean;
  adminActions: boolean;
  podeRemover: boolean;
  onSave: (patch: Partial<Profile> & { papel: string; funcoes: string[] }) => void;
  onAcao: (acao: "desativar" | "reativar" | "excluir", papel?: string) => void;
  processando: boolean;
}) {
  const [confirmando, setConfirmando] = useState<null | "desativar" | "excluir">(null);
  const [funcoes, setFuncoes] = useState<string[]>(
    profile.funcoes && profile.funcoes.length ? profile.funcoes : profile.funcao ? [profile.funcao] : [],
  );
  const [papel, setPapel] = useState(currentRole);
  const [horas, setHoras] = useState(profile.horas_semana);
  const [custoHora, setCustoHora] = useState<string>(profile.custo_hora?.toString() || "");
  const [ativo, setAtivo] = useState(profile.ativo);

  const displayName = profile.full_name || profile.email?.split("@")[0] || "sem nome";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className={`glass-card ${!ativo ? "opacity-60" : ""}`}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback className="bg-primary/15 text-sm text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {profile.email} · {PAPEIS.find((p) => p.value === currentRole)?.label || currentRole}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Esta semana</p>
              <p className="text-sm text-foreground">
                <span className="font-semibold">0h</span>{" "}
                <span className="text-muted-foreground">/ {profile.horas_semana}h</span>
              </p>
            </div>
            <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
              sem apontamento
            </span>
          </div>
        </div>

        {editable && (
          <div className="grid gap-3 md:grid-cols-6">
            <MultiFuncao rateCard={rateCard} value={funcoes} onChange={setFuncoes} />
            <Select value={papel} onValueChange={setPapel} disabled={!adminActions}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={80}
                value={horas}
                onChange={(e) => setHoras(Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground">h/sem</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="custo/h"
                value={custoHora}
                onChange={(e) => setCustoHora(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">R$/h</span>
            </div>
            <span className={`text-xs ${ativo ? "text-success" : "text-amber-500"}`}>
              {ativo ? "ativo" : "sem acesso"}
            </span>
            <Button
              size="sm"
              onClick={() =>
                onSave({
                  funcoes,
                  papel,
                  horas_semana: horas,
                  custo_hora: custoHora ? Number(custoHora) : null,
                  ativo,
                })
              }
              className="bg-primary text-primary-foreground"
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              Salvar
            </Button>
          </div>
        )}

        {/* Zona de perigo: revogar acesso (seguro) ou excluir (só sem horas) */}
        {podeRemover && (
          <div className="mt-4 border-t border-border/40 pt-3">
            {confirmando === null ? (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {ativo ? (
                  <button
                    onClick={() => setConfirmando("desativar")}
                    disabled={processando}
                    className="flex items-center gap-1 text-muted-foreground hover:text-amber-500 disabled:opacity-50"
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Revogar acesso
                  </button>
                ) : (
                  <button
                    onClick={() => onAcao("reativar", papel)}
                    disabled={processando}
                    className="flex items-center gap-1 text-muted-foreground hover:text-success disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Devolver acesso
                  </button>
                )}
                <button
                  onClick={() => setConfirmando("excluir")}
                  disabled={processando}
                  className="flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            ) : (
              <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                <p className="text-xs text-foreground">
                  {confirmando === "desativar" ? (
                    <>
                      <strong>Revogar o acesso de {profile.full_name || "essa pessoa"}?</strong> Ela não consegue mais
                      entrar, mas <strong>as horas apontadas e o histórico ficam preservados</strong>. Dá pra devolver depois.
                    </>
                  ) : (
                    <>
                      <strong>Excluir {profile.full_name || "essa pessoa"} de vez?</strong> Isso apaga a conta. Só funciona
                      se ela <strong>nunca apontou hora</strong> — se apontou, o sistema recusa e você deve revogar o acesso.
                    </>
                  )}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    size="sm"
                    variant={confirmando === "excluir" ? "destructive" : "default"}
                    disabled={processando}
                    onClick={() => {
                      onAcao(confirmando);
                      setConfirmando(null);
                    }}
                  >
                    {processando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    {confirmando === "desativar" ? "Revogar acesso" : "Excluir de vez"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

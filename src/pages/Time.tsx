import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { UsersRound, Plus, KeyRound, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

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
    senha: "",
    funcao: "",
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

  const cadastrar = async () => {
    if (!novo.nome || !novo.email || !novo.senha) {
      toast.error("Preencha nome, e-mail e senha");
      return;
    }
    setCriando(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: novo.email,
        password: novo.senha,
        options: { data: { full_name: novo.nome } },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid) {
        const funcaoObj = rateCard.find((r) => r.funcao === novo.funcao);
        await (supabase as any)
          .from("profiles")
          .update({
            full_name: novo.nome,
            email: novo.email,
            funcao: novo.funcao || null,
            funcao_id: funcaoObj?.id || null,
            horas_semana: novo.horas_semana,
            custo_hora: novo.custo_hora ? Number(novo.custo_hora) : funcaoObj?.custo_hora || null,
            ativo: true,
          })
          .eq("id", uid);
        await supabase.from("user_roles").insert({ user_id: uid, role: novo.papel as any });
      }
      toast.success("Membro cadastrado");
      setNovo({ nome: "", email: "", senha: "", funcao: "", papel: "equipe", horas_semana: 40, custo_hora: "" });
      qc.invalidateQueries({ queryKey: ["team-profiles"] });
      qc.invalidateQueries({ queryKey: ["team-roles"] });
    } catch (e: any) {
      toast.error("Erro ao cadastrar", { description: e.message });
    } finally {
      setCriando(false);
    }
  };

  const salvarPerfil = useMutation({
    mutationFn: async (p: Profile & { papel: string }) => {
      const funcaoObj = rateCard.find((r) => r.funcao === p.funcao);
      const { error: eProfile } = await (supabase as any)
        .from("profiles")
        .update({
          funcao: p.funcao,
          funcao_id: funcaoObj?.id || null,
          custo_hora: p.custo_hora,
          horas_semana: p.horas_semana,
          ativo: p.ativo,
        })
        .eq("id", p.id);
      if (eProfile) throw eProfile;

      const existing = roles.find((r) => r.user_id === p.id);
      if (existing) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: p.papel as any })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: p.id, role: p.papel as any });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-profiles"] });
      qc.invalidateQueries({ queryKey: ["team-roles"] });
      toast.success("Salvo");
    },
    onError: (e: any) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const resetSenha = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return toast.error("Erro ao enviar reset", { description: error.message });
    toast.success(`Link de reset enviado para ${email}`);
  };

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

      {/* Form de cadastro */}
      {isAdmin && (
        <Card className="glass-card">
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                placeholder="Nome"
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              />
              <Input
                placeholder="e-mail"
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
              />
              <Input
                placeholder="senha"
                type="password"
                value={novo.senha}
                onChange={(e) => setNovo({ ...novo, senha: e.target.value })}
              />
              <Select value={novo.funcao} onValueChange={(v) => setNovo({ ...novo, funcao: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Função (ex.: Editor)" />
                </SelectTrigger>
                <SelectContent>
                  {rateCard.map((r) => (
                    <SelectItem key={r.id} value={r.funcao}>
                      {r.funcao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button onClick={cadastrar} disabled={criando} className="bg-primary text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" />
                {criando ? "Cadastrando..." : "Cadastrar"}
              </Button>
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
            onSave={(patch) => salvarPerfil.mutate({ ...p, ...patch })}
            onResetSenha={() => p.email && resetSenha(p.email)}
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

function TeamMemberRow({
  profile,
  currentRole,
  rateCard,
  editable,
  adminActions,
  onSave,
  onResetSenha,
}: {
  profile: Profile;
  currentRole: string;
  rateCard: RateCard[];
  editable: boolean;
  adminActions: boolean;
  onSave: (patch: Partial<Profile> & { papel: string }) => void;
  onResetSenha: () => void;
}) {
  const [funcao, setFuncao] = useState(profile.funcao || "");
  const [papel, setPapel] = useState(currentRole);
  const [horas, setHoras] = useState(profile.horas_semana);
  const [custoHora, setCustoHora] = useState<string>(profile.custo_hora?.toString() || "");
  const [ativo, setAtivo] = useState(profile.ativo);
  const [openReset, setOpenReset] = useState(false);

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
            <Select value={funcao} onValueChange={setFuncao}>
              <SelectTrigger>
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                {rateCard.map((r) => (
                  <SelectItem key={r.id} value={r.funcao}>
                    {r.funcao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {adminActions && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className={ativo ? "text-success" : "text-muted-foreground"}>
                  {ativo ? "ativo" : "inativo"}
                </span>
              </label>
            )}
            <Button
              size="sm"
              onClick={() =>
                onSave({
                  funcao,
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

        {adminActions && (
          <div className="text-xs">
            <button
              onClick={() => setOpenReset((v) => !v)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <KeyRound className="h-3 w-3" />
              Redefinir senha
            </button>
            {openReset && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/40 p-2">
                <Label className="text-xs text-muted-foreground">Enviar link de reset para o e-mail?</Label>
                <Button size="sm" variant="outline" onClick={onResetSenha}>
                  Enviar
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, AlertTriangle, LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type SyncResultEntry = {
  status: string;
  label: string;
  total?: number;
  message?: string;
};

export default function ConfiguracoesIntegracoes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [syncFrequency, setSyncFrequency] = useState("manual");
  const [syncing, setSyncing] = useState(false);
  const [contaAzulConnected, setContaAzulConnected] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [checking, setChecking] = useState(true);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResultEntry> | null>(null);

  useEffect(() => {
    const caSuccess = searchParams.get("ca_success");
    const caError = searchParams.get("ca_error");

    if (caSuccess) {
      toast({ title: "Conta Azul conectada com sucesso!" });
      searchParams.delete("ca_success");
      setSearchParams(searchParams, { replace: true });
    }
    if (caError) {
      toast({ title: "Erro na autenticação", description: caError, variant: "destructive" });
      searchParams.delete("ca_error");
      setSearchParams(searchParams, { replace: true });
    }

    (async () => {
      const { data } = await supabase
        .from("conta_azul_cache")
        .select("payload, fetched_at")
        .eq("data_type", "auth_tokens")
        .maybeSingle();

      if (!data || !data.payload) {
        setContaAzulConnected(false);
        setNeedsReauth(true);
      } else {
        const p = data.payload as any;
        if (p.error || !p.access_token) {
          setContaAzulConnected(false);
          setNeedsReauth(true);
        } else {
          setContaAzulConnected(true);
          const fetchedAt = new Date(data.fetched_at).getTime();
          const expiresIn = p.expires_in || 3600;
          const expiresAt = fetchedAt + expiresIn * 1000;
          if (Date.now() > expiresAt && !p.refresh_token) {
            setNeedsReauth(true);
          }
        }
      }
      setChecking(false);
    })();
  }, []);

  const handleReauth = () => {
    const authUrl = `https://auth.contaazul.com/login?response_type=code&client_id=4ajs7b65jihimmv0cluuaoqp5s&redirect_uri=${encodeURIComponent("https://tappbjqwnwaelrvhcogw.supabase.co/functions/v1/conta-azul-callback")}&state=ESTADO&scope=openid+profile+aws.cognito.signin.user.admin`;
    const popup = window.open(authUrl, "contaazul", "width=600,height=700");

    if (!popup) {
      toast({ title: "Popup bloqueado", description: "Permita popups para autenticar.", variant: "destructive" });
      return;
    }

    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        // Aguarda 2s para o callback salvar o token no banco
        setTimeout(async () => {
          try {
            const { data, error } = await supabase
              .from("conta_azul_cache")
              .select("payload, fetched_at")
              .eq("data_type", "auth_tokens")
              .maybeSingle();

            console.log("[reauth] Token check após popup:", JSON.stringify(data?.payload));

            if (error) {
              console.error("[reauth] Erro ao ler token:", error);
              toast({ title: "Erro ao verificar conexão", description: error.message, variant: "destructive" });
              return;
            }

            const payload = data?.payload as any;
            if (payload?.access_token) {
              setContaAzulConnected(true);
              setNeedsReauth(false);
              toast({ title: "Conta Azul conectada com sucesso!" });
            } else {
              toast({ title: "Autenticação não detectada", description: "Tente novamente.", variant: "destructive" });
            }
          } catch (err: any) {
            console.error("[reauth] Erro:", err);
            toast({ title: "Erro ao verificar conexão", description: err.message, variant: "destructive" });
          }
        }, 2000);
      }
    }, 1000);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResults(null);
    setNeedsReauth(false);

    console.log("[sync] Chamando edge function local: conta-azul-sync");

    try {
      const { data, error } = await supabase.functions.invoke("conta-azul-sync");
      if (error) throw error;

      console.log("[sync] Resposta:", JSON.stringify(data));

      if (data?.results) {
        setSyncResults(data.results);
      }

      if (data?.reauth) {
        setNeedsReauth(true);
        toast({ title: "Sessão expirada", description: data.error, variant: "destructive" });
      } else if (data?.ok) {
        toast({ title: "Sincronização concluída!" });
      } else if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      console.error("[sync] Erro:", err);
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const successCount = syncResults ? Object.values(syncResults).filter((r) => r.status === "ok").length : 0;
  const errorCount = syncResults
    ? Object.values(syncResults).filter((r) => r.status === "error" || r.status === "reauth").length
    : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Integrações</h1>
          <p className="text-sm text-muted-foreground">Conexões com serviços externos</p>
        </div>
      </motion.div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Conta Azul</CardTitle>
            {!checking && (
              <Badge
                variant="outline"
                className={
                  needsReauth
                    ? "text-warning border-warning/30"
                    : contaAzulConnected
                      ? "text-green-400 border-green-400/30"
                      : "text-destructive border-destructive/30"
                }
              >
                {needsReauth ? (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" /> Reautenticação necessária
                  </>
                ) : contaAzulConnected ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" /> Desconectado
                  </>
                )}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Integração com o Conta Azul para sincronização de dados financeiros, contas a pagar e receber.
          </p>
          {needsReauth && (
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-sm text-warning">
              Token inválido ou expirado — faça login novamente na Conta Azul para continuar sincronizando.
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {needsReauth && (
              <Button variant="default" size="sm" onClick={handleReauth}>
                <LogIn className="h-4 w-4 mr-2" />
                Autenticar Conta Azul
              </Button>
            )}
            {contaAzulConnected && !needsReauth && !syncing && (
              <Button variant="outline" size="sm" onClick={handleSync}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sincronizar agora
              </Button>
            )}
            {syncing && (
              <Button variant="outline" size="sm" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sincronizando...
              </Button>
            )}
          </div>

          {/* Sync results */}
          {syncResults && (
            <div className="mt-4 space-y-2">
              <div className="flex gap-3 text-sm font-medium">
                <span className="text-green-400">✓ {successCount} atualizados</span>
                {errorCount > 0 && <span className="text-destructive">✗ {errorCount} falharam</span>}
              </div>
              <div className="space-y-1">
                {Object.entries(syncResults).map(([key, r]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {r.status === "ok" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                    ) : r.status === "skipped" ? (
                      <span className="h-3 w-3 text-muted-foreground shrink-0">—</span>
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    )}
                    <span className="text-muted-foreground">{r.label || key}</span>
                    {r.total !== undefined && <span className="text-muted-foreground/60">({r.total} registros)</span>}
                    {r.status === "error" && r.message && (
                      <span className="text-destructive/70 truncate max-w-[200px]">{r.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Frequência de sincronização</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label>Sincronização automática</Label>
            <Select value={syncFrequency} onValueChange={setSyncFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="daily">Diária</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {syncFrequency === "manual"
                ? "Sincronize manualmente quando precisar"
                : syncFrequency === "daily"
                  ? "Dados sincronizados automaticamente todos os dias às 6h"
                  : "Dados sincronizados automaticamente toda segunda-feira às 6h"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

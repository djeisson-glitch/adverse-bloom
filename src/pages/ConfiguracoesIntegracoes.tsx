import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const CONTA_AZUL_CLIENT_ID = "2jqEMBOBRxJnGKMn8wbpbQ";
const REDIRECT_URI = "https://tappbjqwnwaelrvhcogw.supabase.co/functions/v1/conta-azul-callback";

export default function ConfiguracoesIntegracoes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [syncFrequency, setSyncFrequency] = useState("manual");
  const [syncing, setSyncing] = useState(false);
  const [contaAzulConnected] = useState(true);
  const [needsReauth, setNeedsReauth] = useState(false);

  const handleReauth = () => {
    const authUrl = `https://api.contaazul.com/auth/authorize?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CONTA_AZUL_CLIENT_ID}&scope=sales+accounting&response_type=code`;
    window.open(authUrl, "_blank");
    toast({ title: "Redirecionando para autenticação..." });
    setNeedsReauth(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setNeedsReauth(false);
    try {
      const { data, error } = await supabase.functions.invoke("ca-sync-full");
      if (error) throw error;
      if (data?.reauth) {
        setNeedsReauth(true);
        toast({ title: "Sessão expirada", description: data.error, variant: "destructive" });
      } else if (data?.ok) {
        toast({ title: "Sincronização concluída!" });
      } else if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

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
            <Badge variant="outline" className={needsReauth ? "text-warning border-warning/30" : contaAzulConnected ? "text-green-400 border-green-400/30" : "text-destructive border-destructive/30"}>
              {needsReauth ? (
                <><AlertTriangle className="h-3 w-3 mr-1" /> Sessão expirada</>
              ) : contaAzulConnected ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Desconectado</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Integração com o Conta Azul para sincronização de dados financeiros, contas a pagar e receber.
          </p>
          {needsReauth && (
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-sm text-warning">
              Sessão expirada — faça login novamente na Conta Azul para continuar sincronizando.
            </div>
          )}
          <div className="flex gap-2">
            <Button variant={needsReauth ? "default" : "outline"} size="sm" onClick={handleReauth}>
              {needsReauth ? "Fazer login na Conta Azul" : "Reautenticar"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Frequência de sincronização</CardTitle></CardHeader>
        <CardContent>
          <div>
            <Label>Sincronização automática</Label>
            <Select value={syncFrequency} onValueChange={setSyncFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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

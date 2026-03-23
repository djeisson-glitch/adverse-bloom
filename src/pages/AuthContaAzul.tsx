import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const CONTA_AZUL_CLIENT_ID = "2jqEMBOBRxJnGKMn8wbpbQ";
const REDIRECT_URI = "https://kgrzfwgygvwstqowiroh.supabase.co/functions/v1/conta-azul-callback";

export default function AuthContaAzul() {
  useEffect(() => {
    const authUrl = `https://api.contaazul.com/oauth2/authorize?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CONTA_AZUL_CLIENT_ID}&scope=sales+accounting&response_type=code`;
    window.location.href = authUrl;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Redirecionando para Conta Azul...</p>
      </div>
    </div>
  );
}

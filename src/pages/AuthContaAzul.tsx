import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const CONTA_AZUL_CLIENT_ID = "4ajs7b65jihimmv0cluuaoqp5s";
const REDIRECT_URI = "https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/conta-azul-callback";

export default function AuthContaAzul() {
  useEffect(() => {
    const authUrl = `https://auth.contaazul.com/login?response_type=code&client_id=${CONTA_AZUL_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=ESTADO&scope=openid+profile+aws.cognito.signin.user.admin`;
    const popup = window.open(authUrl, "contaazul", "width=600,height=700");
    if (!popup) {
      window.location.href = authUrl;
    }
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

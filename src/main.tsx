import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { aplicarTema, temaClaroSalvo } from "./hooks/useTema";

// Aplica o tema ANTES de renderizar — senão o app pisca escuro antes de virar
// claro em quem escolheu claro.
aplicarTema(temaClaroSalvo());

// Registra o service worker já no boot (antes era só ao ativar push). É o que
// torna o app INSTALÁVEL — e no iPhone o push só chega com o app instalado na
// tela de início. Falha aqui não pode derrubar o app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);

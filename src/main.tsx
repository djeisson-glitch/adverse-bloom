import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Registra o service worker já no boot (antes era só ao ativar push). É o que
// torna o app INSTALÁVEL — e no iPhone o push só chega com o app instalado na
// tela de início. Falha aqui não pode derrubar o app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);

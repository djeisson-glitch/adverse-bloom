import { motion } from "framer-motion";
import { Map, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MapaOperacional() {
  const handleFullscreen = () => {
    window.open("/mapa-operacional.html", "_blank");
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Mapa Operacional</h1>
          <p className="text-sm text-muted-foreground">Fluxos e processos da Adverse</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleFullscreen}>
          <Maximize2 className="h-4 w-4 mr-2" />
          Abrir em tela cheia
        </Button>
      </motion.div>

      <div className="rounded-lg border border-border overflow-hidden bg-card" style={{ height: "calc(100vh - 180px)" }}>
        <iframe
          src="/mapa-operacional.html"
          className="w-full h-full border-0"
          title="Mapa Operacional"
        />
      </div>
    </div>
  );
}

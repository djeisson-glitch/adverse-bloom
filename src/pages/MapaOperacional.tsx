import { motion } from "framer-motion";
import { Map } from "lucide-react";

export default function MapaOperacional() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <Map className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Mapa Operacional</h1>
        <p className="text-sm text-muted-foreground">Módulo em construção</p>
      </motion.div>
    </div>
  );
}

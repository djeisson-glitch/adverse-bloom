import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

export default function Home() {
  const { profile, user } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "usuário";

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-2xl font-bold text-primary">A</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Adverse OS</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Olá, <span className="text-foreground font-medium">{firstName}</span>
        </p>
        <p className="text-sm text-muted-foreground">Sistema em construção</p>
      </motion.div>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
export function CrmNav() {
  const {can} = usePermissions();
  return <nav aria-label="Navegação do CRM" className="flex gap-1 border-b border-border pb-2 text-sm">
    <NavLink end to="/crm" className={({isActive}) => `rounded-md px-3 py-2 ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>Visão geral</NavLink>
    {can("orcamentos") && <NavLink to="/crm/negocios" className={({isActive}) => `rounded-md px-3 py-2 ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>Negócios</NavLink>}
  </nav>;
}

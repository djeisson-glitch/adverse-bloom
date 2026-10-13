import { describe, expect, it } from "vitest";
import { agendaComercial, etapaComercial, negocioAberto, negociosSemAtividade, prazoAtividade, type CrmLead } from "./crm";
import type { Tables } from "@/integrations/supabase/types";
const lead = (patch: Partial<CrmLead>) => ({id:"l1",nome:"Ana",empresa:"Cliente",status:"novo",proximo_toque:"2026-10-13",responsavel_id:"maiara",...patch}) as CrmLead;
const task = (patch: Partial<Tables<"tasks">>) => ({id:"t1",title:"Retornar proposta",deal_id:"d1",project_id:null,completed:false,due_date:"2026-10-12",created_by:"djeisson",assigned_user_id:"maiara",...patch}) as Tables<"tasks">;
const followup = (patch: Partial<Tables<"follow_ups">>) => ({id:"f1",deal_id:"d2",descricao:"Retomar cliente",status:"pendente",data_prevista:"2026-10-14",responsavel_id:"maiara",...patch}) as Tables<"follow_ups">;

describe("base do CRM",()=>{
  it("reconhece etapas antigas sem inventar mapeamento para etapa desconhecida",()=>{
    expect(etapaComercial("diagnostico")).toBe("lead");
    expect(etapaComercial("orcamento")).toBe("elaboracao");
    expect(etapaComercial("fechamento")).toBe("aceite");
    expect(etapaComercial("personalizada")).toBe("personalizada");
    expect(negocioAberto("ganho")).toBe(false);
    expect(negocioAberto("fechado_ganho")).toBe(false);
    expect(negocioAberto("perdido")).toBe(false);
    expect(negocioAberto("proposta")).toBe(true);
  });
  it("integra pendências sem importar tarefas de produção e registros concluídos",()=>{
    const rows=agendaComercial([lead({}),lead({id:"l2",status:"convertido"}),lead({id:"l3",status:"descartado"})],
      [task({}),task({id:"t2",completed:true}),task({id:"t3",project_id:"p1"}),task({id:"t4",deal_id:null})],
      [followup({}),followup({id:"f2",status:"concluido"})],[{id:"d1",title:"Filme",client:{name:"Cliente"}}]);
    expect(rows.map(a=>a.source)).toEqual(["task","lead","followup"]);
    expect(rows[0].owner).toBe("maiara");
    expect(rows[0].context).toBe("Filme · Cliente");
  });
  it("não confunde autor com responsável e mantém atividades sem data",()=>{
    const rows=agendaComercial([], [task({assigned_user_id:null,due_date:null})],[],[]);
    expect(rows[0].owner).toBeNull();
    expect(prazoAtividade(rows[0].due,"2026-10-13")).toBe("sem_data");
  });
  it("classifica a data local sem marcar hoje como atrasado",()=>{
    expect(prazoAtividade("2026-10-12","2026-10-13")).toBe("atrasado");
    expect(prazoAtividade("2026-10-13","2026-10-13")).toBe("hoje");
    expect(prazoAtividade("2026-10-14","2026-10-13")).toBe("proximo");
  });
  it("só considera próxima atividade com data, sem usar updated_at do orçamento",()=>{
    const rows=agendaComercial([], [task({}),task({id:"t2",deal_id:"d3",due_date:null})],[followup({})],[]);
    const deals=[{id:"d1",stage:"proposta"},{id:"d2",stage:"lead"},{id:"d3",stage:"elaboracao"},{id:"d4",stage:"fechamento"},{id:"d5",stage:"perdido"}];
    expect(negociosSemAtividade(deals,rows).map(d=>d.id)).toEqual(["d3"]);
  });
});

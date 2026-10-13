export type Contrato = {
  id: string; client_id: string; nome: string; inicio: string | null; fim: string | null;
  ativo: boolean; valor_mensal: number; diarias_mes: number; entregas_mes: number;
  acumulo_meses: number; observacoes: string | null; escopo_entregas?: string | null;
  documento_path?: string | null; documento_nome?: string | null; leitura_ia?: unknown;
};
export type MovimentoContrato = {
  id: string; tipo: 'diaria' | 'entrega'; titulo: string; data: string;
  quantidade: number; status: string; faturamento: string;
  projetos: { id: string; nome: string }[];
};
export function limitesMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  return { inicio: `${mes}-01`, fim: `${mes}-${new Date(ano,m,0).getDate()}` };
}
export function resumoContrato(c: Contrato, movimentos: MovimentoContrato[], mes: string) {
  const { inicio, fim } = limitesMes(mes);
  const [ano,m] = mes.split('-').map(Number);
  const janela = new Date(ano, m - Math.max(1,c.acumulo_meses),1);
  const janelaISO = `${janela.getFullYear()}-${String(janela.getMonth()+1).padStart(2,'0')}-01`;
  const de = !c.inicio ? inicio : c.inicio > janelaISO ? c.inicio : janelaISO;
  const ate = c.fim && c.fim < fim ? c.fim : fim;
  const numeroMes = (s:string) => Number(s.slice(0,4))*12+Number(s.slice(5,7));
  const meses = de > ate ? 0 : numeroMes(ate)-numeroMes(de)+1;
  const validos = movimentos.filter(v => v.data <= ate && (!c.inicio || v.data >= c.inicio));
  const noMes = validos.filter(v => v.data >= inicio);
  const noFee = validos.filter(v => v.faturamento === 'mensal');
  const somar = (rows: MovimentoContrato[], tipo: string) => rows.filter(v=>v.tipo===tipo).reduce((s,v)=>s+Number(v.quantidade),0);
  return {
    de, ate, meses, noMes,
    diarias: somar(noMes.filter(v=>v.faturamento==='mensal'),'diaria'),
    entregas: somar(noMes.filter(v=>v.faturamento==='mensal'),'entrega'),
    diariasJanela: somar(noFee.filter(v=>v.data>=de),'diaria'),
    entregasJanela: somar(noFee.filter(v=>v.data>=de),'entrega'),
    limiteDiarias: Number(c.diarias_mes)*meses,
    limiteEntregas: Number(c.entregas_mes)*meses,
    totalDiarias: somar(noFee,'diaria'), totalEntregas: somar(noFee,'entrega'),
  };
}

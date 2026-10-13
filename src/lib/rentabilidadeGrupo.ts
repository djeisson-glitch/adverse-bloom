/** Margem direta dos itens. Não inclui taxa da produtora, imposto ou comissões. */
type ItemGrupo = {
  quantity: number | null;
  diaria?: number | null;
  client_unit_price?: number | null;
  custo_unitario?: number | null;
};

export function rentabilidadeGrupo(itens: ItemGrupo[]) {
  let valor = 0;
  let custo = 0;
  let custoPendente = false;
  for (const item of itens) {
    const unidades = Number(item.quantity || 0) * Number(item.diaria ?? 1);
    const preco = unidades * Number(item.client_unit_price || 0);
    const despesa = unidades * Number(item.custo_unitario || 0);
    valor += preco;
    custo += despesa;
    if (preco > 0 && Number(item.custo_unitario || 0) === 0) custoPendente = true;
  }
  const saldo = Math.round((valor - custo) * 100) / 100;
  const margem = valor > 0 ? saldo / valor * 100 : null;
  const status = saldo < 0 ? 'prejuizo'
    : valor === 0 && custo === 0 ? 'sem_valores'
    : custoPendente ? 'custo_pendente'
    : saldo === 0 ? 'sem_margem'
    : margem !== null && margem >= 30 ? 'boa' : 'atencao';
  return { valor, custo, saldo, margem, status };
}

export const SINAIS_GRUPO = {
  boa: { label: 'Muito bom', cor: 'text-success', faixa: 'border-l-success' },
  atencao: { label: 'Atenção', cor: 'text-warning', faixa: 'border-l-warning' },
  sem_margem: { label: 'Sem margem', cor: 'text-destructive', faixa: 'border-l-destructive' },
  prejuizo: { label: 'Acima do orçado', cor: 'text-destructive', faixa: 'border-l-destructive' },
  custo_pendente: { label: 'Conferir custos', cor: 'text-warning', faixa: 'border-l-warning' },
  sem_valores: { label: 'Sem valores', cor: 'text-muted-foreground', faixa: 'border-l-border' },
} as const;

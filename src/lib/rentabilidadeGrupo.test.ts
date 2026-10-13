import { describe, expect, it } from 'vitest';
import { rentabilidadeGrupo } from './rentabilidadeGrupo';
const item = (preco: number, custo: number, quantity = 1, diaria = 1) =>
  ({ quantity, diaria, client_unit_price: preco, custo_unitario: custo });

describe('margem direta por grupo', () => {
  it('calcula quantidade e diárias e usa a receita como base da margem', () => {
    expect(rentabilidadeGrupo([item(100, 70, 2, 3)])).toMatchObject({valor:600,custo:420,saldo:180,margem:30,status:'boa'});
  });
  it('separa margem baixa, equilíbrio e prejuízo', () => {
    expect(rentabilidadeGrupo([item(100,71)]).status).toBe('atencao');
    expect(rentabilidadeGrupo([item(100,100)]).status).toBe('sem_margem');
    expect(rentabilidadeGrupo([item(100,110)])).toMatchObject({saldo:-10,status:'prejuizo'});
    expect(rentabilidadeGrupo([item(0,100)])).toMatchObject({margem:null,status:'prejuizo'});
  });
  it('não apresenta custo zerado ou grupo vazio como rentabilidade confirmada', () => {
    expect(rentabilidadeGrupo([item(100,0),item(100,50)]).status).toBe('custo_pendente');
    expect(rentabilidadeGrupo([item(100,0,0)]).status).toBe('sem_valores');
    expect(rentabilidadeGrupo([]).status).toBe('sem_valores');
  });
  it('prioriza estouro conhecido mesmo com custo pendente em outra linha', () => {
    expect(rentabilidadeGrupo([item(100,0),item(100,250)]).status).toBe('prejuizo');
  });
  it('ignora diárias zero e evita falso prejuízo por precisão decimal', () => {
    expect(rentabilidadeGrupo([item(100,150,1,0)]).status).toBe('sem_valores');
    expect(rentabilidadeGrupo([item(.1,.3,3),item(.7,.1)]).status).toBe('sem_margem');
  });
});

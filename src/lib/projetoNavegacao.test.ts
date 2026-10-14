import { expect, it } from 'vitest';
import { origemProjetos, linkProjeto } from './projetoNavegacao';
it('permite voltar do projeto ao orçamento mensal de origem',()=>{
 expect(origemProjetos('/orcamentos-mensais/abc-123')).toBe('/orcamentos-mensais/abc-123');
 expect(linkProjeto('p','/orcamentos-mensais/abc-123')).toBe('/projetos/p?retorno=%2Forcamentos-mensais%2Fabc-123');
 expect(origemProjetos('/clientes/abc?aba=projetos')).toBe('/clientes/abc?aba=projetos');
});
it('rejeita retorno externo ou caminho não autorizado',()=>{
 for(const url of ['https://example.com','//example.com','/orcamentos-mensais/../login','/login']) expect(origemProjetos(url)).toBeNull();
});

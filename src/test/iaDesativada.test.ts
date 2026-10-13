// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const names=['ai-report','ai-insights','generate-proposal-description','mergulho-ia','digest-diario','orcamento-resumo','sugerir-itens-orcamento','intake-ia','intake-revisao','chat-assistant','assistente-equipe'];
function compile(path:string){return ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
const policy:any={};
new Function('exports','Deno',compile('supabase/functions/_shared/iaDisponibilidade.ts'))(policy,{env:{get:()=>undefined}});
describe('pausa de IA no servidor',()=>{
 it.each(names)('%s não lê dados nem chama provedor enquanto desativado',async(name)=>{
  let handler:any;
  const modules=(path:string)=>{
   if(path.includes('iaDisponibilidade'))return policy;
   if(path.includes('http/server'))return {serve:(fn:any)=>handler=fn};
   if(path.includes('supabase-js'))return {createClient:()=>{throw new Error('Banco não deve ser acessado');}};
   throw new Error('Import inesperado: '+path);
  };
  new Function('exports','require','Deno',compile(`supabase/functions/${name}/index.ts`))({},modules,{env:{get:()=>undefined}});
  const response=await handler(new Request('https://test.invalid',{method:'POST',body:'{}'}));
  expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:'AI_DISABLED'});
  const options=await handler(new Request('https://test.invalid',{method:'OPTIONS'}));expect(options.status).toBe(200);
 });
});

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Secao, Linha, Campo, SeletorFuncoes, Enviado, est } from "@/components/cadastro/CamposCadastro";
import { CabecalhoPublico, RodapeConfidencial } from "@/components/publico/CabecalhoPublico";

/** Cadastro público de FORNECEDOR (tema escuro). Grava por RPC — o anônimo
 *  nunca toca nas tabelas. Dados bancários vão pra tabela lateral. */
export default function CadastroFornecedor() {
  const tema = "escuro" as const;
  const s = est(tema);
  const [f, setF] = useState({
    nome: "", cpf_cnpj: "", razao_social: "", email: "", telefone: "",
    banco_codigo: "", banco_nome: "", agencia: "", conta: "", pix: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
    observacoes: "",
  });
  const [funcoes, setFuncoes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const enviar = async () => {
    setErro(null);
    if (!f.nome.trim() || !f.email.trim()) { setErro("Preencha o nome e o e-mail."); return; }
    setEnviando(true);
    const { error } = await (supabase as any).rpc("cadastro_fornecedor_submit", { p: { ...f, funcoes } });
    setEnviando(false);
    if (error) { setErro(error.message); return; }
    setPronto(true);
  };

  if (pronto) return <Enviado tema={tema} titulo="fornecedor" />;

  return (
    <div className={s.pagina}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <CabecalhoPublico
          tema={tema}
          titulo="Cadastro de Fornecedor"
          subtitulo="Preencha seus dados para se cadastrar como fornecedor da Adverse"
        />

        <div className="space-y-5">
          <Secao titulo="Dados pessoais / empresa" tema={tema}>
            <Linha>
              <Campo rotulo="Nome / Apelido" tema={tema} obrigatorio valor={f.nome} onChange={set("nome")} placeholder="Seu nome ou nome fantasia" />
              <Campo rotulo="CPF / CNPJ" tema={tema} valor={f.cpf_cnpj} onChange={set("cpf_cnpj")} placeholder="000.000.000-00 ou 00.000.000/0000-00" />
            </Linha>
            <Linha>
              <Campo rotulo="Razão Social" tema={tema} valor={f.razao_social} onChange={set("razao_social")} placeholder="Se tiver CNPJ" />
              <Campo rotulo="E-mail" tema={tema} obrigatorio tipo="email" valor={f.email} onChange={set("email")} placeholder="seu@email.com" />
            </Linha>
            <Campo rotulo="Telefone / WhatsApp" tema={tema} valor={f.telefone} onChange={set("telefone")} placeholder="+55 11 99999-0000" />
          </Secao>

          <Secao titulo="O que você faz" tema={tema}>
            <SeletorFuncoes tema={tema} selecionadas={funcoes} onChange={setFuncoes} />
          </Secao>

          <Secao titulo="Dados bancários" tema={tema}>
            <Linha>
              <Campo rotulo="Código do Banco" tema={tema} valor={f.banco_codigo} onChange={set("banco_codigo")} placeholder="Ex: 001, 033, 341..." />
              <Campo rotulo="Nome do Banco" tema={tema} valor={f.banco_nome} onChange={set("banco_nome")} placeholder="Ex: Banco do Brasil, Itaú..." />
            </Linha>
            <Linha>
              <Campo rotulo="Agência" tema={tema} valor={f.agencia} onChange={set("agencia")} placeholder="0000" />
              <Campo rotulo="Conta" tema={tema} valor={f.conta} onChange={set("conta")} placeholder="00000-0" />
            </Linha>
            <Campo rotulo="Chave PIX" tema={tema} valor={f.pix} onChange={set("pix")} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
            <p className={s.nota}>
              Os dados bancários e a chave Pix são usados exclusivamente para pagamento e ficam acessíveis apenas a pessoas autorizadas.
            </p>
          </Secao>

          <Secao titulo="Endereço" tema={tema}>
            <Linha>
              <Campo rotulo="CEP" tema={tema} valor={f.cep} onChange={set("cep")} placeholder="00000-000" />
              <Campo rotulo="Logradouro" tema={tema} valor={f.logradouro} onChange={set("logradouro")} placeholder="Rua, avenida..." />
            </Linha>
            <Linha>
              <Campo rotulo="Número" tema={tema} valor={f.numero} onChange={set("numero")} placeholder="123" />
              <Campo rotulo="Complemento" tema={tema} valor={f.complemento} onChange={set("complemento")} placeholder="Apto, sala..." />
            </Linha>
            <Linha>
              <Campo rotulo="Bairro" tema={tema} valor={f.bairro} onChange={set("bairro")} />
              <Campo rotulo="Cidade" tema={tema} valor={f.cidade} onChange={set("cidade")} />
            </Linha>
            <Campo rotulo="Estado" tema={tema} valor={f.estado} onChange={set("estado")} placeholder="UF" />
          </Secao>

          <Secao titulo="Observações" tema={tema}>
            <Campo rotulo="" tema={tema} area valor={f.observacoes} onChange={set("observacoes")}
              placeholder="Especialidade, disponibilidade, informações adicionais..." />
          </Secao>

          <p className={s.nota}>
            Ao enviar este formulário, você declara que as informações são verdadeiras e concorda que sejam tratadas pela
            Adverse para fins de cadastro, contratação, logística, pagamento e produção.
          </p>

          {erro && <p className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">{erro}</p>}

          <button className={s.botao} onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Enviar Cadastro"}
          </button>
          <p className={s.rodape}>Seus dados serão armazenados de forma segura e utilizados apenas pela Adverse.</p>
        </div>

        <RodapeConfidencial tema={tema} />
      </div>
    </div>
  );
}

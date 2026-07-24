import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Secao, Linha, Campo, SeletorFuncoes, Enviado, est } from "@/components/cadastro/CamposCadastro";

/** Cadastro público de FREELANCER (tema claro). Mesma entrada por RPC. */
export default function CadastroFreelancer() {
  const tema = "claro" as const;
  const s = est(tema);
  const [f, setF] = useState({
    nome_completo: "", instagram: "", portfolio: "", nome_artistico: "", funcao_principal: "",
    especialidades: "", equipamento_proprio: "", valor_diaria: "", condicoes_comerciais: "",
    cpf: "", rg: "", orgao_emissor: "", data_nascimento: "", email: "", whatsapp: "",
    cidade: "", estado: "",
    cnpj: "", razao_social: "", nome_fantasia: "", inscricao_municipal: "",
    pj_cep: "", pj_endereco: "", pj_numero: "", pj_complemento: "", pj_bairro: "", pj_cidade: "", pj_estado: "", email_fiscal: "",
    banco_nome: "", banco_codigo: "", agencia: "", conta: "", tipo_conta: "", titular: "", pix: "",
    restricao_alimentar: "", tam_camiseta: "", tam_calcado: "",
    carro_modelo: "", carro_cor: "", carro_placa: "",
  });
  const [funcoes, setFuncoes] = useState<string[]>([]);
  const [semRestricao, setSemRestricao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const enviar = async () => {
    setErro(null);
    if (!f.nome_completo.trim() || !f.email.trim()) { setErro("Preencha o nome completo e o e-mail."); return; }
    setEnviando(true);
    const { error } = await (supabase as any).rpc("cadastro_freelancer_submit", {
      p: { ...f, funcoes, sem_restricao: semRestricao },
    });
    setEnviando(false);
    if (error) { setErro(error.message); return; }
    setPronto(true);
  };

  if (pronto) return <Enviado tema={tema} titulo="freelancer" />;

  return (
    <div className={s.pagina}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 text-center">
          <p className="text-3xl font-black tracking-tight">
            adverse.rec <span className="text-orange-600">//</span>
          </p>
          <h1 className="mt-3 text-2xl font-bold">Cadastro de Freelancer</h1>
          <p className="mt-1 text-sm text-slate-600">
            Preencha seus dados para se cadastrar como freelancer da <strong>Adverse</strong>
          </p>
        </header>

        <div className="space-y-5">
          <Secao titulo="Dados pessoais" tema={tema}>
            <Campo rotulo="Nome completo" tema={tema} obrigatorio valor={f.nome_completo} onChange={set("nome_completo")} />
            <Linha>
              <Campo rotulo="Instagram" tema={tema} valor={f.instagram} onChange={set("instagram")} placeholder="@usuario" />
              <Campo rotulo="Portfólio" tema={tema} valor={f.portfolio} onChange={set("portfolio")} placeholder="https://..." />
            </Linha>
            <Linha>
              <Campo rotulo="Nome artístico / apelido profissional" tema={tema} valor={f.nome_artistico} onChange={set("nome_artistico")} />
              <Campo rotulo="Função principal" tema={tema} valor={f.funcao_principal} onChange={set("funcao_principal")} placeholder="Ex: Fotógrafo, Cinegrafista, Editor..." />
            </Linha>
            <Campo rotulo="Especialidades" tema={tema} valor={f.especialidades} onChange={set("especialidades")} placeholder="Ex: Fotografia de casamento, filmagem aérea..." />
            <Linha>
              <Campo rotulo="Possui equipamento próprio" tema={tema} valor={f.equipamento_proprio} onChange={set("equipamento_proprio")} placeholder="Sim / Não" />
              <Campo rotulo="Valor médio da diária" tema={tema} valor={f.valor_diaria} onChange={set("valor_diaria")} placeholder="Ex: 850,00" />
            </Linha>
            <Campo rotulo="Condições comerciais" tema={tema} area valor={f.condicoes_comerciais} onChange={set("condicoes_comerciais")} placeholder="Ex: Aceito PIX, emito nota fiscal MEI..." />
            <Linha>
              <Campo rotulo="CPF" tema={tema} valor={f.cpf} onChange={set("cpf")} placeholder="000.000.000-00" />
              <Campo rotulo="RG" tema={tema} valor={f.rg} onChange={set("rg")} />
            </Linha>
            <Linha>
              <Campo rotulo="Órgão emissor do RG" tema={tema} valor={f.orgao_emissor} onChange={set("orgao_emissor")} />
              <Campo rotulo="Data de nascimento" tema={tema} tipo="date" valor={f.data_nascimento} onChange={set("data_nascimento")} />
            </Linha>
            <Linha>
              <Campo rotulo="E-mail" tema={tema} obrigatorio tipo="email" valor={f.email} onChange={set("email")} />
              <Campo rotulo="WhatsApp" tema={tema} valor={f.whatsapp} onChange={set("whatsapp")} />
            </Linha>
            <Linha>
              <Campo rotulo="Cidade" tema={tema} valor={f.cidade} onChange={set("cidade")} />
              <Campo rotulo="Estado" tema={tema} valor={f.estado} onChange={set("estado")} placeholder="UF" />
            </Linha>
          </Secao>

          <Secao titulo="O que você faz" tema={tema}>
            <SeletorFuncoes tema={tema} selecionadas={funcoes} onChange={setFuncoes} />
          </Secao>

          <Secao titulo="Dados jurídicos (se emite nota por PJ)" tema={tema}>
            <Campo rotulo="CNPJ" tema={tema} valor={f.cnpj} onChange={set("cnpj")} placeholder="00.000.000/0000-00" />
            <Linha>
              <Campo rotulo="Razão social" tema={tema} valor={f.razao_social} onChange={set("razao_social")} />
              <Campo rotulo="Nome fantasia" tema={tema} valor={f.nome_fantasia} onChange={set("nome_fantasia")} />
            </Linha>
            <Linha>
              <Campo rotulo="Inscrição municipal" tema={tema} valor={f.inscricao_municipal} onChange={set("inscricao_municipal")} />
              <Campo rotulo="CEP" tema={tema} valor={f.pj_cep} onChange={set("pj_cep")} placeholder="00000-000" />
            </Linha>
            <Linha>
              <Campo rotulo="Endereço" tema={tema} valor={f.pj_endereco} onChange={set("pj_endereco")} />
              <Campo rotulo="Número" tema={tema} valor={f.pj_numero} onChange={set("pj_numero")} />
            </Linha>
            <Linha>
              <Campo rotulo="Complemento" tema={tema} valor={f.pj_complemento} onChange={set("pj_complemento")} />
              <Campo rotulo="Bairro" tema={tema} valor={f.pj_bairro} onChange={set("pj_bairro")} />
            </Linha>
            <Linha>
              <Campo rotulo="Cidade" tema={tema} valor={f.pj_cidade} onChange={set("pj_cidade")} />
              <Campo rotulo="Estado" tema={tema} valor={f.pj_estado} onChange={set("pj_estado")} placeholder="UF" />
            </Linha>
            <Campo rotulo="E-mail fiscal / financeiro" tema={tema} valor={f.email_fiscal} onChange={set("email_fiscal")} />
          </Secao>

          <Secao titulo="Dados bancários" tema={tema}>
            <Linha>
              <Campo rotulo="Banco" tema={tema} valor={f.banco_nome} onChange={set("banco_nome")} />
              <Campo rotulo="Código do banco" tema={tema} valor={f.banco_codigo} onChange={set("banco_codigo")} />
            </Linha>
            <Linha>
              <Campo rotulo="Agência" tema={tema} valor={f.agencia} onChange={set("agencia")} />
              <Campo rotulo="Conta" tema={tema} valor={f.conta} onChange={set("conta")} />
            </Linha>
            <Linha>
              <Campo rotulo="Tipo de conta" tema={tema} valor={f.tipo_conta} onChange={set("tipo_conta")} placeholder="Corrente, poupança..." />
              <Campo rotulo="Titular da conta" tema={tema} valor={f.titular} onChange={set("titular")} />
            </Linha>
            <Campo rotulo="Chave Pix" tema={tema} valor={f.pix} onChange={set("pix")} />
            <p className={s.nota}>
              Os dados bancários e a chave Pix serão usados exclusivamente para pagamento e ficam acessíveis apenas a pessoas autorizadas.
            </p>
          </Secao>

          <Secao titulo="Informações gerais" tema={tema}>
            <Campo rotulo="Restrição alimentar" tema={tema} area valor={f.restricao_alimentar} onChange={set("restricao_alimentar")}
              placeholder="Descreva sua restrição alimentar" />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700">
              <input type="checkbox" checked={semRestricao} onChange={(e) => setSemRestricao(e.target.checked)} />
              Não tenho
            </label>
            <p className={s.nota}>
              Informe restrições alimentares apenas se necessário para sua participação, logística de alimentação ou segurança.
              É opcional, pode revelar dado sensível e será usada apenas para essa finalidade, com o seu consentimento.
            </p>
            <Linha>
              <Campo rotulo="Tamanho camiseta" tema={tema} valor={f.tam_camiseta} onChange={set("tam_camiseta")} placeholder="Ex: P, M, G, GG" />
              <Campo rotulo="Tamanho calçado" tema={tema} valor={f.tam_calcado} onChange={set("tam_calcado")} placeholder="Ex: 38" />
            </Linha>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Modelo do carro" tema={tema} valor={f.carro_modelo} onChange={set("carro_modelo")} />
              <Campo rotulo="Cor" tema={tema} valor={f.carro_cor} onChange={set("carro_cor")} />
              <Campo rotulo="Placa" tema={tema} valor={f.carro_placa} onChange={set("carro_placa")} />
            </div>
          </Secao>

          <p className={s.nota}>
            Ao enviar este formulário, você declara que as informações são verdadeiras e concorda que sejam tratadas pela
            Adverse para fins de cadastro, contratação, logística, pagamento e produção.
          </p>

          {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

          <button className={s.botao} onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Enviar Cadastro"}
          </button>
          <p className={s.rodape}>Seus dados serão armazenados de forma segura e utilizados apenas pela Adverse.</p>
        </div>
      </div>
    </div>
  );
}

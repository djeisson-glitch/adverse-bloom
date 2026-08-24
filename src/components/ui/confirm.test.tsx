import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { ConfirmProvider, usePrompt, useConfirm } from "./confirm";

/**
 * O prompt precisa RESOLVER a promessa.
 *
 * Bug de 20/08: o botão de confirmar fazia `e.preventDefault()` (que impede o
 * Radix de fechar) e chamava `setPOpen(false)` na mão. Mudar o state
 * manualmente não dispara `onOpenChange`, então o resolver nunca era chamado
 * e o `await perguntar(...)` ficava pendurado PRA SEMPRE — sem erro, sem
 * toast, sem nada. O relato foi "clico, coloco o nome e nada acontece".
 *
 * Estes testes existem porque essa falha é invisível: o código "roda", o
 * modal fecha, e a linha seguinte simplesmente nunca executa.
 */

function Sonda({ obrigatorio }: { obrigatorio?: boolean }) {
  const perguntar = usePrompt();
  const [resultado, setResultado] = useState<string>("(esperando)");
  return (
    <>
      <button onClick={async () => {
        const v = await perguntar({ title: "Nome da opção", confirmText: "Criar", obrigatorio });
        // Só chega aqui se a promessa resolveu — que é o ponto do teste.
        setResultado(v === null ? "(cancelou)" : `resolveu:${v}`);
      }}>
        abrir
      </button>
      <output>{resultado}</output>
    </>
  );
}

function SondaConfirm() {
  const confirmar = useConfirm();
  const [r, setR] = useState("(esperando)");
  return (
    <>
      <button onClick={async () => setR(String(await confirmar({ title: "Certeza?" })))}>abrir</button>
      <output>{r}</output>
    </>
  );
}

// `fireEvent` e não `user-event`: a lib de eventos de usuário não está no
// projeto, e um teste não deve arrastar dependência nova pro app.
const abrir = async () => fireEvent.click(await screen.findByText("abrir"));
const digitar = async (texto: string) =>
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: texto } });

describe("prompt", () => {
  it("resolve com o texto ao confirmar — era o que ficava pendurado", async () => {
    render(<ConfirmProvider><Sonda /></ConfirmProvider>);
    await abrir();
    await digitar("Com drone");
    fireEvent.click(screen.getByText("Criar"));
    await waitFor(() => expect(screen.getByText("resolveu:Com drone")).toBeTruthy());
  });

  it("resolve null ao cancelar — desistir também precisa devolver", async () => {
    render(<ConfirmProvider><Sonda /></ConfirmProvider>);
    await abrir();
    fireEvent.click(screen.getByText("Cancelar"));
    await waitFor(() => expect(screen.getByText("(cancelou)")).toBeTruthy());
  });

  it("resolve UMA vez: o fechamento depois de confirmar não sobrescreve com null", async () => {
    render(<ConfirmProvider><Sonda /></ConfirmProvider>);
    await abrir();
    await digitar("Sem drone");
    fireEvent.click(screen.getByText("Criar"));
    await waitFor(() => expect(screen.getByText("resolveu:Sem drone")).toBeTruthy());
    // O onOpenChange chega logo depois; se ele resolvesse de novo, viraria
    // "(cancelou)" e a opção nasceria sem nome.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByText("resolveu:Sem drone")).toBeTruthy();
  });
});

describe("confirm", () => {
  it("continua resolvendo true — o caminho que nunca quebrou", async () => {
    render(<ConfirmProvider><SondaConfirm /></ConfirmProvider>);
    await abrir();
    fireEvent.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(screen.getByText("true")).toBeTruthy());
  });
});

import { expect, it } from "vitest";
import { urlPastaServidor } from "./pastaServidor";

it("preserva o caminho e underscores, codificando caracteres especiais sem mudar o destino", () => {
  const path = "_. Database 2026/01. Clientes - Projetos/10. Outubro/SLC Máquinas/[0369]_CHAMADA_TRATOR_3036";
  const url = urlPastaServidor(path)!;
  expect(url).toMatch(/^adverse-finder:\/\/open\?path=/);
  expect(new URL(url).searchParams.get("path")).toBe(path);
  expect(url).not.toContain(" ");
  expect(urlPastaServidor("Cliente #1/100% pronto")).toContain("Cliente%20%231%2F100%25%20pronto");
});
it.each([null, "", "/absoluto", "a/../b", "a/./b", "a//b", "a\\b", "a\n"])('não abre caminho inválido %s', path => {
  expect(urlPastaServidor(path)).toBeNull();
});

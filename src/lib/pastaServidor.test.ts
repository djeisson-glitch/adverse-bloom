import { expect, it } from "vitest";
import { urlPastaServidor } from "./pastaServidor";

it("preserva o caminho e underscores, codificando caracteres especiais sem mudar o destino", () => {
  const path = "_. Database 2026/01. Clientes - Projetos/10. Outubro/SLC Máquinas/[0369]_CHAMADA_TRATOR_3036";
  const url = urlPastaServidor(path)!;
  expect(url).toMatch(/^smb:\/\/192\.168\.18\.200\/PROJETOS_ATIVOS\//);
  expect(decodeURIComponent(url)).toBe(`smb://192.168.18.200/PROJETOS_ATIVOS/${path}`);
  expect(url).not.toContain(" ");
  expect(urlPastaServidor("Cliente #1/100% pronto")).toContain("Cliente%20%231/100%25%20pronto");
});
it.each([null, "", "/absoluto", "a/../b", "a/./b", "a//b", "a\\b", "a\n"])('não abre caminho inválido %s', path => {
  expect(urlPastaServidor(path)).toBeNull();
});

import { describe, it, expect } from "vitest";
import { linkPortfolio, linkInstagram, rotuloLink } from "./perfilLinks";

/**
 * Os casos são o que realmente chega num formulário público: gente cola a URL
 * inteira, gente escreve só o domínio, gente escreve o @ do Instagram, e
 * gente escreve uma frase. As três primeiras têm que virar link; a última
 * não pode virar um link quebrado com cara de bom.
 */

describe("portfólio", () => {
  it("URL completa passa inteira", () => {
    expect(linkPortfolio("https://vimeo.com/fulano")).toBe("https://vimeo.com/fulano");
  });

  it("domínio sem protocolo ganha https", () => {
    expect(linkPortfolio("www.meusite.com.br")).toBe("https://www.meusite.com.br/");
    expect(linkPortfolio("behance.net/fulano")).toBe("https://behance.net/fulano");
  });

  it("frase não vira link", () => {
    expect(linkPortfolio("mando por whatsapp")).toBeNull();
    expect(linkPortfolio("")).toBeNull();
    expect(linkPortfolio(null)).toBeNull();
  });

  it("protocolo perigoso não vira link", () => {
    // Campo público: javascript:/data: chegam se alguém quiser tentar.
    expect(linkPortfolio("javascript:alert(1)")).toBeNull();
    expect(linkPortfolio("data:text/html,<script>")).toBeNull();
  });
});

describe("instagram", () => {
  it("@usuario vira perfil", () => {
    expect(linkInstagram("@adverse.rec")).toBe("https://instagram.com/adverse.rec");
  });

  it("usuário sem arroba também", () => {
    expect(linkInstagram("adverse_rec")).toBe("https://instagram.com/adverse_rec");
  });

  it("URL do perfil passa direto", () => {
    expect(linkInstagram("instagram.com/fulano")).toBe("https://instagram.com/fulano");
    expect(linkInstagram("https://www.instagram.com/fulano/")).toBe("https://www.instagram.com/fulano/");
  });

  it("texto que não é usuário não vira perfil", () => {
    expect(linkInstagram("não tenho")).toBeNull();
    expect(linkInstagram("@ me chama no direct")).toBeNull();
  });
});

describe("rótulo", () => {
  it("mostra sem protocolo e sem barra final", () => {
    expect(rotuloLink("https://vimeo.com/fulano/")).toBe("vimeo.com/fulano");
  });
});

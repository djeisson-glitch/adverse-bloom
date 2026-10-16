import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AbrirPastaFinder } from "./AbrirPastaFinder";
const href="adverse-finder://open?path=example";
function allowsNavigation(element: HTMLElement) {
  let allowed = false;
  // Observe React's decision, then stop native navigation (unsupported by jsdom).
  document.addEventListener("click", event => {
    allowed = !event.defaultPrevented;
    event.preventDefault();
  }, { once: true });
  fireEvent.click(element);
  return allowed;
}
afterEach(()=>{cleanup();localStorage.clear();});
it("orienta a primeira instalação e só permite abertura direta após confirmação",()=>{
  render(<AbrirPastaFinder href={href} detail="Pasta do projeto"/>);
  expect(allowsNavigation(screen.getByRole("link",{name:"Abrir pasta no Finder"}))).toBe(false);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Baixar auxiliar para Mac"})).toHaveAttribute("href","/integracoes/adverse-finder-mac.zip");
  expect(allowsNavigation(screen.getByRole("link",{name:"Já instalei · Abrir pasta"}))).toBe(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localStorage.getItem("adverse-finder-setup-v1")).toBe("1");
  expect(allowsNavigation(screen.getByRole("link",{name:"Abrir pasta no Finder"}))).toBe(true);
});
it("abre com um clique nas próximas visitas e permite rever a instalação",()=>{
  localStorage.setItem("adverse-finder-setup-v1","1");
  render(<AbrirPastaFinder href={href} detail="Pasta do projeto"/>);
  expect(allowsNavigation(screen.getByRole("link",{name:"Abrir pasta no Finder"}))).toBe(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Configurar abertura no Finder"}));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

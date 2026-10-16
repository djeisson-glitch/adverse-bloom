/** Endereço de rede aberto pelo Finder, sem credenciais no link. */
export function urlPastaServidor(relativePath: unknown): string | null {
  if (typeof relativePath !== "string") return null;
  const parts = relativePath.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) return null;
  return `smb://192.168.18.200/PROJETOS_ATIVOS/${parts.map(encodeURIComponent).join("/")}`;
}

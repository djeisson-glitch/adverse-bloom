/** Abre a conexão existente pelo auxiliar local, sem montar uma subpasta via SMB. */
export function urlPastaServidor(relativePath: unknown): string | null {
  if (typeof relativePath !== "string") return null;
  const parts = relativePath.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) return null;
  return `adverse-finder://open?path=${encodeURIComponent(relativePath)}`;
}

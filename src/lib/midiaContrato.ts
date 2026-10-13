import type { MovimentoContrato } from './consumoContrato';

export type TipoMidia = 'video' | 'foto' | 'outro' | 'conferir';
export function tipoMidia(m: MovimentoContrato): TipoMidia {
  if (m.tipo_midia) return m.tipo_midia;
  if (m.tipo_registro && m.tipo_registro !== 'entregavel') return 'outro';
  const titulo = m.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const foto = /\b(fotos?|fotografias?|fotografia|ensaio fotografico)\b/.test(titulo);
  const video = /\b(videos?|filmes?|aftermovie|reels?|teaser|vt|motion|animacao|depoimentos?|institucional|making of)\b/.test(titulo);
  if (foto && video) return 'conferir';
  if (foto) return 'foto';
  if (video) return 'video';
  return 'conferir';
}

export function consomeFranquia(tipo: string | undefined, m: MovimentoContrato) {
  const midia = tipoMidia(m);
  return tipo === 'video' ? midia === 'video' : tipo === 'video_foto' ? ['video','foto'].includes(midia) : true;
}

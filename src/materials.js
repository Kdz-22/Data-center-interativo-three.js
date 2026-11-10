import * as THREE from 'three';

// Materiais do ambiente (piso, paredes e teto).
//
// As texturas são PROCEDURAIS: desenhadas em um <canvas> com a API 2D e enviadas
// para a GPU como CanvasTexture. Vantagens para o projeto:
//  - nenhuma imagem externa (sem problema de licença nem de download);
//  - a textura é desenhada já na escala real (1 placa = 0,6 m), então dá para
//    explicar exatamente como o mapeamento UV e o repeat funcionam.

// Piso elevado de data center: placas padrão de 60 × 60 cm.
// Embaixo delas passam cabos e o ar frio do resfriamento.
export const FLOOR_TILE = 0.6;

// Gerador pseudoaleatório com semente (mulberry32).
// Com Math.random() a textura mudaria a cada recarga; com semente fixa ela é sempre igual.
function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

// Ruído fino: pequenas variações de brilho pixel a pixel, para a superfície
// não parecer uma cor chapada de computador.
function addNoise(ctx, size, amount, rand) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Converte o canvas em textura repetível.
// repeat = quantas vezes a imagem cabe na superfície (em cada eixo de UV).
function toTexture(canvas, repeatX, repeatY, isColor) {
  const tex = new THREE.CanvasTexture(canvas);
  // RepeatWrapping: UV acima de 1 volta ao início da imagem (ladrilhamento).
  // O padrão (ClampToEdge) esticaria a última linha de pixels.
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  // Textura de COR está em sRGB; mapas de dados (rugosidade, bump) são lineares.
  // Sem isto as cores ficariam lavadas, porque o renderer trabalha em espaço linear.
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  // Filtro anisotrópico: o piso visto em ângulo rasante (altura dos olhos) fica nítido
  // em vez de borrado. O Three.js limita ao máximo que a placa de vídeo suporta.
  tex.anisotropy = 8;
  return tex;
}

// ------------------------------------------------------------------ piso
// Uma imagem = uma placa de 60 cm. O desenho tem a junta (fresta escura) na borda.
function drawFloorTile(size, rand) {
  const { canvas, ctx } = createCanvas(size);
  const groove = Math.round(size * 0.012); // junta de ~7 mm

  // Fresta entre as placas (fundo)
  ctx.fillStyle = '#0d1014';
  ctx.fillRect(0, 0, size, size);

  // Placa: leve degradê para não ficar uniforme
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#343b46');
  grad.addColorStop(1, '#2a3039');
  ctx.fillStyle = grad;
  ctx.fillRect(groove, groove, size - 2 * groove, size - 2 * groove);

  // Bisel: borda clara em cima/esquerda e escura embaixo/direita (sensação de espessura)
  ctx.lineWidth = groove;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(groove * 1.5, size - groove * 1.5);
  ctx.lineTo(groove * 1.5, groove * 1.5);
  ctx.lineTo(size - groove * 1.5, groove * 1.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.moveTo(size - groove * 1.5, groove * 1.5);
  ctx.lineTo(size - groove * 1.5, size - groove * 1.5);
  ctx.lineTo(groove * 1.5, size - groove * 1.5);
  ctx.stroke();

  addNoise(ctx, size, 10, rand);
  return canvas;
}

// Bump map: imagem em tons de cinza que representa ALTURA (branco = alto, preto = baixo).
// O shader usa a variação de brilho entre pixels vizinhos para inclinar a normal,
// e a luz passa a "ver" a junta como um sulco, sem mudar nenhum vértice da geometria.
// Precisa ter exatamente o mesmo desenho do map, senão o relevo não bate com a cor.
function drawFloorBump(size) {
  const { canvas, ctx } = createCanvas(size);
  const groove = Math.round(size * 0.012);
  ctx.fillStyle = '#000';             // junta: fundo
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';             // placa: topo
  ctx.fillRect(groove, groove, size - 2 * groove, size - 2 * groove);
  return canvas;
}

// Roughness map: o Three.js lê o canal VERDE (G) e MULTIPLICA pelo material.roughness.
// Placa (claro, ~0.55): plástico/laminado um pouco polido, mostra um reflexo fraco das luzes.
// Junta (branco, 1.0): poeira e fresta, totalmente fosca.
// O ruído deixa o reflexo levemente manchado, como um piso de verdade com uso.
function drawFloorRoughness(size, rand) {
  const { canvas, ctx } = createCanvas(size);
  const groove = Math.round(size * 0.012);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(groove, groove, size - 2 * groove, size - 2 * groove);
  addNoise(ctx, size, 40, rand);
  return canvas;
}

export function createFloorMaterial(width, depth) {
  const rand = seededRandom(42);
  const size = 512;

  // A PlaneGeometry tem UV de 0 a 1 em toda a sua extensão.
  // Para cada placa medir 0,6 m: repeat = tamanho da sala / tamanho da placa.
  // 20 / 0,6 ≈ 33,3 e 14 / 0,6 ≈ 23,3 (a última fileira é cortada na parede, como num piso real).
  const rx = width / FLOOR_TILE;
  const ry = depth / FLOOR_TILE;

  // Os três mapas usam o mesmo repeat: a junta da cor, do relevo e da rugosidade coincidem.
  const map = toTexture(drawFloorTile(size, rand), rx, ry, true);
  const bumpMap = toTexture(drawFloorBump(size), rx, ry, false);
  const roughnessMap = toTexture(drawFloorRoughness(size, rand), rx, ry, false);

  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff, // branco: a cor vem toda da textura (color multiplica o map)
    bumpMap,
    bumpScale: 2.0,  // força do relevo; ajustável no gui (passo dos materiais do ambiente)
    roughnessMap,
    roughness: 0.9,  // multiplicado pelo roughnessMap: placa ≈ 0.5, junta = 0.9
    metalness: 0.2,
  });
}

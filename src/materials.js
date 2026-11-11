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
// Paredes revestidas com painéis metálicos de 1 × 1 m.
export const WALL_PANEL = 1.0;
// Forro modular (o mesmo padrão de 60 cm do piso, alinhado com ele).
export const CEILING_TILE = 0.6;

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

// ------------------------------------------------------------------ paredes
// Painel metálico: fresta escura na borda e quatro rebites nos cantos.
function drawWallPanel(size, rand) {
  const { canvas, ctx } = createCanvas(size);
  const seam = Math.round(size * 0.01);

  ctx.fillStyle = '#12161b';
  ctx.fillRect(0, 0, size, size);

  // Degradê vertical: um pouco mais claro em cima, como se a luz viesse do teto
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#404858');
  grad.addColorStop(1, '#353c49');
  ctx.fillStyle = grad;
  ctx.fillRect(seam, seam, size - 2 * seam, size - 2 * seam);

  drawRivets(ctx, size, '#5a6372');
  addNoise(ctx, size, 8, rand);
  return canvas;
}

function drawRivets(ctx, size, color) {
  const r = size * 0.012;
  const m = size * 0.05; // distância do rebite até a borda
  ctx.fillStyle = color;
  for (const [x, y] of [[m, m], [size - m, m], [m, size - m], [size - m, size - m]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Relevo da parede: fresta funda (preto), painel (cinza) e rebites salientes (branco)
function drawWallBump(size) {
  const { canvas, ctx } = createCanvas(size);
  const seam = Math.round(size * 0.01);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(seam, seam, size - 2 * seam, size - 2 * seam);
  drawRivets(ctx, size, '#fff');
  return canvas;
}

// Devolve DOIS materiais de parede: as paredes têm comprimentos diferentes
// (20 m e 14 m), então o repeat em U é diferente para cada uma.
// texture.clone() cria outra textura com repeat próprio, mas reaproveita a mesma
// imagem (Source): ela é enviada para a GPU uma vez só.
export function createWallMaterials(width, depth, height) {
  const rand = seededRandom(7);
  const size = 512;
  const baseMap = toTexture(drawWallPanel(size, rand), 1, 1, true);
  const baseBump = toTexture(drawWallBump(size), 1, 1, false);

  function make(length) {
    const map = baseMap.clone();
    const bumpMap = baseBump.clone();
    // U acompanha o comprimento da parede, V acompanha a altura (5 m = 5 painéis)
    map.repeat.set(length / WALL_PANEL, height / WALL_PANEL);
    bumpMap.repeat.copy(map.repeat);
    return new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 1.5,
      roughness: 0.6,  // metal pintado: reflexo difuso, não espelhado
      metalness: 0.4,
    });
  }

  return { long: make(width), short: make(depth) };
}

// ------------------------------------------------------------------ teto
// Forro acústico: placa escura microperfurada, presa numa grade metálica (perfil "T").
function drawCeilingTile(size, rand) {
  const { canvas, ctx } = createCanvas(size);
  const bar = Math.round(size * 0.02); // perfil T de ~1,2 cm

  ctx.fillStyle = '#3b414b'; // grade metálica, mais clara que a placa
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1b1f26';
  ctx.fillRect(bar, bar, size - 2 * bar, size - 2 * bar);

  // Microfuros (absorção acústica): pontinhos em grade regular
  ctx.fillStyle = '#0e1115';
  const step = size / 24;
  for (let y = bar + step; y < size - bar; y += step) {
    for (let x = bar + step; x < size - bar; x += step) {
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  addNoise(ctx, size, 6, rand);
  return canvas;
}

// Relevo do teto: a grade fica ABAIXO do plano da placa (salta para dentro da sala),
// por isso a grade é branca (alta) e a placa é escura.
function drawCeilingBump(size) {
  const { canvas, ctx } = createCanvas(size);
  const bar = Math.round(size * 0.02);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#333';
  ctx.fillRect(bar, bar, size - 2 * bar, size - 2 * bar);
  return canvas;
}

export function createCeilingMaterial(width, depth) {
  const rand = seededRandom(99);
  const size = 512;
  const rx = width / CEILING_TILE;
  const ry = depth / CEILING_TILE;
  return new THREE.MeshStandardMaterial({
    map: toTexture(drawCeilingTile(size, rand), rx, ry, true),
    bumpMap: toTexture(drawCeilingBump(size), rx, ry, false),
    bumpScale: 1.5,
    roughness: 0.95, // material acústico: praticamente sem reflexo
    metalness: 0.0,
  });
}

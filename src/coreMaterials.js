import * as THREE from 'three';
import { seededRandom, createCanvas, toTexture } from './materials.js';

// Materiais do núcleo de IA (M3).
// Usa os mesmos utilitários de textura procedural de src/materials.js.

// ------------------------------------------------------------------ pedestal
// Trilhas de circuito impresso desenhadas no canvas.
// A função é chamada duas vezes com a MESMA semente: uma para a textura de cor
// e outra para o mapa emissivo. Assim as trilhas que brilham coincidem com as desenhadas.
function drawCircuit(ctx, w, h, rand, traceColor, padColor) {
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Faixas horizontais perto do topo e da base: viram dois anéis de luz no pedestal
  ctx.fillStyle = traceColor;
  ctx.fillRect(0, h * 0.08, w, 4);
  ctx.fillRect(0, h * 0.9, w, 4);

  for (let i = 0; i < 22; i++) {
    // Trilha: reta, diagonal de 45° e reta (o desenho típico de uma placa de circuito)
    const x0 = rand() * w;
    const y0 = h * (0.2 + rand() * 0.6);
    const a = 20 + rand() * 70;
    const d = (rand() < 0.5 ? -1 : 1) * (10 + rand() * 30);
    const b = 20 + rand() * 70;
    const pts = [
      [x0, y0],
      [x0 + a, y0],
      [x0 + a + Math.abs(d), y0 + d],
      [x0 + a + Math.abs(d) + b, y0 + d],
    ];

    // A textura dá a volta no cilindro (U de 0 a 1 = 360°). Uma trilha que sai pela
    // direita tem de continuar na esquerda, senão aparece uma emenda.
    // Por isso cada trilha é desenhada também deslocada de -w e +w.
    for (const off of [-w, 0, w]) {
      ctx.strokeStyle = traceColor;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + off, pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x + off, y);
      ctx.stroke();

      // "Pads" (pontos de solda) nas duas pontas
      ctx.fillStyle = padColor;
      for (const [x, y] of [pts[0], pts[3]]) {
        ctx.beginPath();
        ctx.arc(x + off, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function createPedestalMaterial(color) {
  const W = 512;
  const H = 256;

  // Cor: metal escuro com as trilhas um pouco mais claras (cobre envelhecido/estanho)
  const colorCanvas = createCanvas(W, H);
  colorCanvas.ctx.fillStyle = '#14171c';
  colorCanvas.ctx.fillRect(0, 0, W, H);
  drawCircuit(colorCanvas.ctx, W, H, seededRandom(2050), '#2c333d', '#3a434f');

  // Emissivo: fundo PRETO (não brilha) e trilhas BRANCAS (brilham).
  // O tom vem de material.emissive (o mesmo ciano do núcleo), que multiplica este mapa.
  const emissiveCanvas = createCanvas(W, H);
  emissiveCanvas.ctx.fillStyle = '#000';
  emissiveCanvas.ctx.fillRect(0, 0, W, H);
  drawCircuit(emissiveCanvas.ctx, W, H, seededRandom(2050), '#fff', '#fff');

  // Na lateral do CylinderGeometry, U dá a volta (circunferência) e V vai da base ao topo.
  // Circunferência ≈ 2π · 1,4 ≈ 8,8 m e altura 0,5 m: repetimos 6× em U para as trilhas
  // não ficarem esticadas na horizontal. Em V, uma vez só (as faixas ficam no topo e na base).
  const map = toTexture(colorCanvas.canvas, 6, 1, true);
  const emissiveMap = toTexture(emissiveCanvas.canvas, 6, 1, true); // emissivo é cor: sRGB
  // As trilhas também ficam em relevo: o próprio mapa emissivo serve de bump (branco = alto)
  const bumpMap = toTexture(emissiveCanvas.canvas, 6, 1, false);

  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color(color),
    emissiveIntensity: 1.2,
    bumpMap,
    bumpScale: 1.0,
    roughness: 0.35, // metal escovado: reflete o environment map, mas desfocado
    metalness: 0.85,
  });
}

// ------------------------------------------------------------------ casca de vidro
// Uma esfera de vidro em volta do núcleo, como uma cápsula de contenção.
//
// MeshPhysicalMaterial é a extensão do MeshStandardMaterial com parâmetros extras
// (clearcoat, ior, transmission, sheen...). Aqui usamos:
//  - clearcoat: uma segunda camada de verniz por cima, com reflexo próprio e bem nítido;
//  - ior 1.5: índice de refração do vidro comum; controla a força do reflexo (Fresnel):
//    de frente o vidro quase não reflete, nas bordas reflete muito;
//  - transparent + opacity: deixa ver o núcleo por dentro.
// NÃO usamos transmission (refração real): ela obriga o Three.js a renderizar a cena
// numa textura extra a cada quadro, e a cena já é pesada por causa das sombras.
export function createGlassShellMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xbfefff,
    metalness: 0.0,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    ior: 1.5,
    transparent: true,
    opacity: 0.18,
    // depthWrite false: o vidro não "tapa" no z-buffer o que está dentro dele
    // (núcleo e anéis), evitando que partes do interior sumam dependendo da ordem de desenho.
    depthWrite: false,
  });
}

import * as THREE from 'three';
import { createCanvas, toTexture } from './materials.js';

// Fitas de LED da sala.
//
//  - Piso: duas fitas ao longo do corredor central, na frente das fileiras de servidores.
//    Pulsos de luz correm em direção ao núcleo de IA (-X), como luzes-guia.
//  - Teto: uma fita em todo o perímetro, rente às paredes (iluminação indireta de "sanca").
//
// As fitas são só materiais emissivos: não iluminam nada (o emissivo não emite luz para
// os vizinhos). Elas ficam bonitas por causa do bloom, que cria o halo em volta.
// Colocar PointLights ao longo delas seria muito caro (dezenas de luzes por pixel).

const AISLE_STRIP_Z = 1.95; // logo antes da frente dos servidores (que fica em z ≈ ±2,07)
const AISLE_LENGTH = 11.2;  // mesma extensão das fileiras (14 unidades × 0,8 m)
const DASH = 0.6;           // um pulso a cada 0,6 m (o mesmo módulo das placas do piso)

// Imagem 1D (só varia em U): um pulso claro com "cauda" que se apaga, sobre um fundo fraco.
// O fundo não é preto: a fita fica sempre visível, e o pulso é o destaque.
function drawChase() {
  const W = 128;
  const { canvas, ctx } = createCanvas(W, 4);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ffffff');    // cabeça do pulso (vai na frente, em direção ao núcleo)
  g.addColorStop(0.35, '#3a3a3a'); // cauda
  g.addColorStop(1, '#3a3a3a');    // fundo
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 4);
  return canvas;
}

export function createLedStrips(room, color = '#00e5ff') {
  const params = {
    color,
    floorIntensity: 3.0,
    ceilingIntensity: 1.2,
    chaseSpeed: 1.2, // pulsos por segundo (≈ 0,7 m/s)
  };

  const group = new THREE.Group();
  group.name = 'led-strips';

  // ---------------------------------------------------------------- piso
  // Na BoxGeometry, a face de cima tem U ao longo de X: repeat = comprimento / espaçamento.
  const chaseMap = toTexture(drawChase(), AISLE_LENGTH / DASH, 1, true);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x000000, // a cor difusa não importa: tudo o que se vê é o emissivo
    emissive: new THREE.Color(color),
    emissiveMap: chaseMap,
    emissiveIntensity: params.floorIntensity,
  });
  // 4 cm de largura e 1 cm de altura. Fica 5 mm acima do piso para não disputar
  // o z-buffer com ele (z-fighting: os dois planos piscariam no mesmo lugar).
  const floorGeo = new THREE.BoxGeometry(AISLE_LENGTH, 0.01, 0.04);
  for (const z of [-AISLE_STRIP_Z, AISLE_STRIP_Z]) {
    const strip = new THREE.Mesh(floorGeo, floorMat);
    strip.position.set(0, 0.01, z); // centro a 1 cm: metade da altura (5 mm) + 5 mm de folga
    group.add(strip);
  }

  // ---------------------------------------------------------------- teto (perímetro)
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(color),
    emissiveIntensity: params.ceilingIntensity,
  });
  const y = room.height - 0.06;
  const inset = 0.06; // afastada da parede para não entrar nela
  const w = room.width / 2 - inset;
  const d = room.depth / 2 - inset;
  const longGeo = new THREE.BoxGeometry(room.width - 2 * inset, 0.03, 0.03);
  const shortGeo = new THREE.BoxGeometry(0.03, 0.03, room.depth - 2 * inset);
  for (const [geo, x, z] of [[longGeo, 0, -d], [longGeo, 0, d], [shortGeo, -w, 0], [shortGeo, w, 0]]) {
    const strip = new THREE.Mesh(geo, ceilingMat);
    strip.position.set(x, y, z);
    group.add(strip);
  }

  // Fitas não projetam nem recebem sombra: são a própria fonte de luz (visual)
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  function apply() {
    floorMat.emissive.set(params.color);
    ceilingMat.emissive.set(params.color);
    floorMat.emissiveIntensity = params.floorIntensity;
    ceilingMat.emissiveIntensity = params.ceilingIntensity;
  }

  // Animação de UV, como no núcleo e nos tubos: deslocar o offset faz os pulsos correrem.
  // offset.x crescendo puxa a imagem para -U, ou seja, para -X: em direção ao núcleo.
  function update(delta) {
    chaseMap.offset.x = (chaseMap.offset.x + params.chaseSpeed * delta) % 1;
  }

  return { group, params, apply, update };
}

export function addLedGui(gui, leds) {
  const f = gui.addFolder('Fitas de LED');
  f.addColor(leds.params, 'color').name('cor').onChange(leds.apply);
  f.add(leds.params, 'floorIntensity', 0, 8, 0.1).name('brilho do piso').onChange(leds.apply);
  f.add(leds.params, 'ceilingIntensity', 0, 8, 0.1).name('brilho do teto').onChange(leds.apply);
  f.add(leds.params, 'chaseSpeed', -3, 3, 0.05).name('velocidade dos pulsos');
  f.close();
  return f;
}

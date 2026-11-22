import './style.css';
import * as THREE from 'three';
import { createRoom, ROOM } from './room.js';
import { buildDataCenter } from './datacenter.js';
import { FirstPersonController } from './firstPerson.js';
import { createDiagnostics } from './diagnostics.js';
import { createAICore, addAICoreGui } from './core.js';
import { addEmissiveGui } from './emissive.js';
import { createCeilingSpotLights, addSpotLightGui } from './lighting.js';
import { createEnvironment, addMaterialsGui } from './materials.js';
import { createCoolingPipes } from './cooling.js';
import { createPostProcessing, addBloomGui } from './postprocessing.js';
// ------------------------------------------------------------------ cena e renderer
const scene = new THREE.Scene();
const BG_COLOR = 0x05070a;
scene.background = new THREE.Color(BG_COLOR);

// Névoa exponencial: a cor de cada pixel vai se misturando com a cor da névoa
// conforme a distância até a câmera. fator = 1 - e^(-(densidade · distância)²)
// Com densidade 0,03: a 5 m quase nada (2%), a 10 m ~9%, no fundo do corredor (~18 m) ~25%.
// O fundo da sala fica levemente "no ar", o que dá profundidade e o clima de sala
// refrigerada, sem esconder o núcleo. A cor é a mesma do fundo, para não aparecer emenda.
// FogExp2 (e não Fog linear): a névoa linear tem um início e um fim fixos e cria uma
// "parede" visível onde começa; a exponencial cresce de forma suave desde a câmera.
scene.fog = new THREE.FogExp2(BG_COLOR, 0.03);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping; // evita o emissivo estourar em branco
renderer.toneMappingExposure = 1.0;

// Sombras: o renderer só calcula shadow maps se isto estiver ligado.
// PCFShadowMap compara a profundidade em vários pontos ao redor (filtro PCF),
// o que suaviza a borda da sombra; o tamanho do filtro é o shadow.radius de cada luz.
// (No Three.js r186 o PCFSoftShadowMap foi removido; o PCF com radius faz esse papel.)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // telas 3x/4x custam muito e quase não melhoram
document.body.appendChild(renderer.domElement);

// ------------------------------------------------------------------ câmera principal
// fov 70°: um pouco mais aberto que o padrão (50°), dá sensação de estar dentro do corredor
//          sem distorcer as bordas como acontece acima de ~90°.
// near 0,1 m: permite chegar perto dos racks sem a frente deles ser cortada.
// far 40 m: a maior distância dentro da sala é a diagonal (√(20² + 14² + 5²) ≈ 25 m);
//           40 m cobre com folga. Um far maior só espalharia a precisão do z-buffer à toa.
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 40);

// Começa numa ponta do corredor central, olhando para o fundo da sala (-X).
camera.position.set(8.5, 1.7, 0);
camera.lookAt(0, 1.4, 0);

// ------------------------------------------------------------------ luzes
// Luz base: preenchimento sem sombra, para a sala não ficar preta.
// As SpotLights com sombra são da Letícia; o núcleo de IA vem logo abaixo.
const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x0b0d12, 0.6);
scene.add(hemi);

// SpotLights do teto, com sombra (src/lighting.js)
const spots = createCeilingSpotLights(scene, ROOM);

// ------------------------------------------------------------------ sala (ambiente base)
const room = createRoom();
scene.add(room);
// Sistema de resfriamento líquido: tubos frio/quente entre os servidores (src/cooling.js)
const cooling = createCoolingPipes(ROOM);
scene.add(cooling.group);
// Reflexos dos materiais PBR (environment map pré-filtrado, ver src/materials.js)
createEnvironment(renderer, scene);
// Núcleo de IA no fundo do corredor (-X), de frente para o ponto onde a câmera nasce
const core = createAICore();
core.group.position.set(-7.5, 0, 0);
scene.add(core.group);

// ------------------------------------------------------------------ navegação
const WALL_MARGIN = 0.4; // distância mínima da câmera até a parede (m)
const controller = new FirstPersonController(camera, renderer.domElement, {
    eyeHeight: 1.7,
    walkSpeed: 3.0,
    runMultiplier: 2.0,
    bounds: {
        minX: -ROOM.width / 2 + WALL_MARGIN,
        maxX: ROOM.width / 2 - WALL_MARGIN,
        minZ: -ROOM.depth / 2 + WALL_MARGIN,
        maxZ: ROOM.depth / 2 - WALL_MARGIN,
    },
});

// ------------------------------------------------------------------ modo diagnóstico
// Bloom (src/postprocessing.js): o diagnóstico usa o composer para desenhar a viewport principal
const post = createPostProcessing(renderer, scene, camera);
const diagnostics = createDiagnostics({ scene, renderer, camera, controller, room: ROOM, post });

// Painéis de iluminação e materiais no mesmo lil-gui do diagnóstico
const gui = diagnostics.gui;
addAICoreGui(gui, core);
addSpotLightGui(gui, spots, renderer);
addMaterialsGui(gui, room.userData.materials, scene, ROOM);
addBloomGui(gui, post);
const baseFolder = gui.addFolder('Luz base');
baseFolder.add(hemi, 'intensity', 0, 2).name('intensidade');
baseFolder.addColor(hemi, 'color').name('cor do céu');
baseFolder.add(renderer, 'toneMappingExposure', 0.2, 3).name('exposição');
const fogFolder = gui.addFolder('Névoa');
const fogState = { enabled: true };
const fog = scene.fog;
// Trocar scene.fog entre o objeto e null recompila os shaders (o código da névoa
// entra ou sai do shader). É só um clique no painel, não acontece a cada quadro.
fogFolder.add(fogState, 'enabled').name('ligada').onChange((on) => { scene.fog = on ? fog : null; });
fogFolder.add(fog, 'density', 0, 0.1, 0.001).name('densidade');
fogFolder.addColor(fog, 'color').name('cor');
// ------------------------------------------------------------------ HUD
const hud = document.getElementById('hud');
const status = document.getElementById('status');
controller.pointerLock.addEventListener('lock', () => hud.classList.add('locked'));
controller.pointerLock.addEventListener('unlock', () => hud.classList.remove('locked'));

// ------------------------------------------------------------------ modelos
let mixers = [];
let follower = null;
buildDataCenter(scene)
    .then((result) => {
        mixers = result.mixers;
        follower = result.follower;
        addEmissiveGui(gui, result.glow);
        diagnostics.refresh(); // aplica wireframe/culling/etc. também nos modelos recém-chegados
        status.remove();
    })
    .catch((err) => {
        console.error(err);
        status.textContent = 'Erro ao carregar os modelos (veja o console)';
    });

// ------------------------------------------------------------------ redimensionamento
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight); // os render targets do bloom acompanham a janela
});

// ------------------------------------------------------------------ loop
// THREE.Timer: .update() uma vez por quadro, ANTES de ler .getDelta().
// O delta (em segundos) alimenta a navegação e as animações dos robôs,
// então tudo anda na mesma velocidade a 30, 60 ou 144 fps.
const timer = new THREE.Timer();
timer.connect(document); // pausa o relógio quando a aba fica oculta (Page Visibility API)

renderer.setAnimationLoop(() => {
    timer.update();
    const delta = timer.getDelta();

    // 1) Atualiza tudo o que se move neste quadro...
    controller.update(delta);
    for (const m of mixers) m.update(delta);
    follower?.update(delta, camera.position); // robô que segue o jogador
    core.update(timer.getElapsed(), delta);   // pulsação, anéis e fluxo de dados do núcleo
    cooling.update(delta);                    // fluxo nos tubos de resfriamento

    // 2) ...e só depois desenha. Se alguma atualização viesse depois do render,
    // ela só apareceria na tela no quadro seguinte (um quadro de atraso).
    diagnostics.render(delta);
});

// Acesso pelo console do navegador para depuração (ex.: __app.camera.position)
if (import.meta.env.DEV) window.__app = { scene, camera, renderer, controller, diagnostics };
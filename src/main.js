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
// ------------------------------------------------------------------ cena e renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);

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
const diagnostics = createDiagnostics({ scene, renderer, camera, controller, room: ROOM });

// Painéis de iluminação no mesmo lil-gui do diagnóstico
const gui = diagnostics.gui;
addAICoreGui(gui, core);
addSpotLightGui(gui, spots, renderer);
addMaterialsGui(gui, room.userData.materials, scene, ROOM);
const baseFolder = gui.addFolder('Luz base');
baseFolder.add(hemi, 'intensity', 0, 2).name('intensidade');
baseFolder.addColor(hemi, 'color').name('cor do céu');
baseFolder.add(renderer, 'toneMappingExposure', 0.2, 3).name('exposição');
// ------------------------------------------------------------------ HUD
const hud = document.getElementById('hud');
const status = document.getElementById('status');
controller.pointerLock.addEventListener('lock', () => hud.classList.add('locked'));
controller.pointerLock.addEventListener('unlock', () => hud.classList.remove('locked'));

// ------------------------------------------------------------------ modelos
let mixers = [];
buildDataCenter(scene)
    .then((result) => {
        mixers = result.mixers;
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

    controller.update(delta);
    for (const m of mixers) m.update(delta);

    core.update(timer.getElapsed(), delta);
    diagnostics.render(delta);
});

// Acesso pelo console do navegador para depuração (ex.: __app.camera.position)
if (import.meta.env.DEV) window.__app = { scene, camera, renderer, controller, diagnostics };
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadRackAssembly, loadServerV2Console, loadRobot, fitToHeight, loadServerGLTF } from './loaders.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createRoom, ROOM } from './room.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(6, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Controle provisório só para inspecionar os modelos (a navegação em 1ª pessoa vem depois)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);

// Luzes provisórias (sem luz os materiais ficam pretos)
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 5);
scene.add(sun);

// Chão
scene.add(createRoom());

const mixers = []; // um AnimationMixer por robô

function spawnRobot(gltf, { x, z, rotY = 0, clip = 'Idle', height = 1.4 }) {
    // SkeletonUtils.clone é obrigatório para modelos com esqueleto
    const robot = SkeletonUtils.clone(gltf.scene);
    fitToHeight(robot, height);
    robot.position.set(x, 0, z);
    robot.rotation.y = rotY;
    scene.add(robot);

    const clipData = THREE.AnimationClip.findByName(gltf.animations, clip);
    if (!clipData) {
        console.warn(`Animação "${clip}" não encontrada`);
        return robot;
    }

    const mixer = new THREE.AnimationMixer(robot);
    const action = mixer.clipAction(clipData);
    action.time = Math.random() * clipData.duration; // evita robôs sincronizados
    action.play();
    mixers.push(mixer);
    return robot;
}

async function init() {
    // Carrega V2 e rack uma vez; a escala é aplicada nos originais e os clones herdam
    const [v2, rack] = await Promise.all([loadServerV2Console(), loadRackAssembly()]);
    fitToHeight(v2, 2.2);
    fitToHeight(rack, 2.2);

    const UNITS_PER_ROW = 14;
    const SPACING = 0.8;        // largura de cada unidade (~0,73 m) + folga
    const AISLE_Z = 2.5;        // centro da fileira de V2 até o corredor central
    const RACK_OFFSET = 1.2;    // centro do V2 até o centro do rack atrás dele
    const RACKS_FACE_WALL = true; // true: frente do rack para a parede; false: para o corredor

    const rows = [
        // backDir: lado da parede (-1 = -Z, +1 = +Z)
        { z: -AISLE_Z, v2RotY: -Math.PI / 2, rackRotY: -Math.PI / 2, backDir: -1 },
        { z: AISLE_Z, v2RotY: Math.PI / 2, rackRotY: Math.PI / 2, backDir: 1 },
    ];
    const startX = -((UNITS_PER_ROW - 1) * SPACING) / 2; // centraliza a fileira na sala

    for (const row of rows) {
        for (let i = 0; i < UNITS_PER_ROW; i++) {
            const x = startX + i * SPACING;

            // V2 (frente para o corredor central)
            const unit = v2.clone();
            unit.position.set(x, 0, row.z);
            unit.rotation.y = row.v2RotY;
            scene.add(unit);

            // Rack atrás do V2, alinhado no mesmo x
            const r = rack.clone();
            r.position.set(x, 0, row.z + row.backDir * RACK_OFFSET);
            r.rotation.y = RACKS_FACE_WALL ? row.rackRotY : -row.rackRotY;
            scene.add(r);
        }
    }

    const robotGltf = await loadRobot();
    spawnRobot(robotGltf, { x: -3, z: 0.5, clip: 'Idle' });
    spawnRobot(robotGltf, { x: -4.5, z: -0.5, rotY: Math.PI / 2, clip: 'Walking' });
}
init().catch(console.error);

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
    timer.update();
    const delta = timer.getDelta(); // vai servir para a navegação e os mixers
    mixers.forEach((m) => m.update(delta)); // <-- nova linha
    controls.update();
    renderer.render(scene, camera);
});
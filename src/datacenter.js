import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadRackAssembly, loadServerV2Console, loadRobot, fitToHeight } from './loaders.js';

// Monta o conteúdo da sala: duas fileiras de servidores (V2 + rack) e os robôs.
// Devolve os AnimationMixers dos robôs, que o loop principal atualiza com o delta do Timer.

function spawnRobot(parent, gltf, mixers, { x, z, rotY = 0, clip = 'Idle', height = 1.4 }) {
    // SkeletonUtils.clone é obrigatório para modelos com esqueleto:
    // o clone() comum copiaria a malha, mas os ossos continuariam apontando para o original.
    const robot = SkeletonUtils.clone(gltf.scene);
    robot.name = 'robot';
    fitToHeight(robot, height);
    robot.position.set(x, 0, z);
    robot.rotation.y = rotY;
    parent.add(robot);

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

export async function buildDataCenter(scene) {
    const mixers = [];

    // Grupo próprio para os equipamentos: deixa o grafo de cena organizado
    // (sala / servidores / robôs) e facilita explicar a hierarquia na arguição.
    const servers = new THREE.Group();
    servers.name = 'servers';
    const robots = new THREE.Group();
    robots.name = 'robots';
    scene.add(servers, robots);

    // Carrega V2 e rack uma vez; a escala é aplicada nos originais e os clones herdam.
    // Os clones compartilham geometria e material, então trocar um material
    // (wireframe, side) afeta todas as cópias de uma vez.
    const [v2, rack, robotGltf] = await Promise.all([
        loadServerV2Console(),
        loadRackAssembly(),
        loadRobot(),
    ]);
    fitToHeight(v2, 2.2);
    fitToHeight(rack, 2.2);

    const UNITS_PER_ROW = 14;
    const SPACING = 0.8;          // largura de cada unidade (~0,73 m) + folga
    const AISLE_Z = 2.5;          // centro da fileira de V2 até o corredor central
    const RACK_OFFSET = 1.2;      // centro do V2 até o centro do rack atrás dele
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
            servers.add(unit);

            // Rack atrás do V2, alinhado no mesmo x
            const r = rack.clone();
            r.position.set(x, 0, row.z + row.backDir * RACK_OFFSET);
            r.rotation.y = RACKS_FACE_WALL ? row.rackRotY : -row.rackRotY;
            servers.add(r);
        }
    }

    spawnRobot(robots, robotGltf, mixers, { x: -3, z: 0.5, clip: 'Idle' });
    spawnRobot(robots, robotGltf, mixers, { x: -4.5, z: -0.5, rotY: Math.PI / 2, clip: 'Walking' });

    return { mixers };
}
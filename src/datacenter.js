import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadRackAssembly, loadServerV2Console, loadRobot, fitToHeight, loadServerGLTF } from './loaders.js';
import { makeTexturesGlow } from './emissive.js';
import { toTexture, createBrushedMetal } from './materials.js';
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
    robot.userData.mixer = mixer; // o seguidor reaproveita este mixer para alternar Idle/Walking
    mixers.push(mixer);
    return robot;
}

// Robô que segue o jogador: gira e anda até o alvo, alternando Idle/Walking.
function makeFollower(robot, gltf, { speed = 1.4, startDist = 2.5, stopDist = 1.8, turnSpeed = 4 } = {}) {
    const mixer = robot.userData.mixer;
    const idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Idle'));
    const walk = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Walking'));
    const dir = new THREE.Vector3();
    let moving = false;

    function setMoving(on) {
        moving = on;
        const [from, to] = on ? [idle, walk] : [walk, idle];
        to.reset().play();
        from.crossFadeTo(to, 0.3, false); // transição suave entre as animações
    }

    return {
        update(delta, target) {
            dir.set(target.x - robot.position.x, 0, target.z - robot.position.z);
            const dist = dir.length();

            // Histerese: começa a andar além de startDist e só para abaixo de stopDist.
            // Com um limite único, o robô ficaria alternando Idle/Walking na borda.
            if (!moving && dist > startDist) setMoving(true);
            else if (moving && dist < stopDist) setMoving(false);

            // Gira suavemente para o alvo (o robô olha para +Z, então atan2(x, z) dá o ângulo em Y).
            // O módulo mantém a diferença em [-π, π] para girar pelo lado mais curto.
            const diff = THREE.MathUtils.euclideanModulo(
                Math.atan2(dir.x, dir.z) - robot.rotation.y + Math.PI, 2 * Math.PI) - Math.PI;
            const maxTurn = turnSpeed * delta;
            robot.rotation.y += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);

            if (moving) robot.position.addScaledVector(dir.normalize(), speed * delta);
        },
    };
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
    // Emissivo nos materiais do V2. Feito no original, antes de clonar:
    // os clones compartilham os materiais, então vale para todas as unidades.
    // O MTLLoader gera MeshPhongMaterial (sem roughness). Converte o console para PBR,
    // mantendo a textura. Feito antes do emissivo, para o gui apontar para o material novo.
    const consoleMat = new THREE.MeshStandardMaterial({ name: 'console_auv', roughness: 1.0, metalness: 1.0 });
    consoleMat.roughnessMap = toTexture(createBrushedMetal(), 2, 2, false);
    v2.traverse((o) => {
        if (!o.isMesh) return;
        const list = [].concat(o.material).map((m) => {
            if (m.name !== 'console_auv') return m;
            consoleMat.map = m.map;
            return consoleMat;
        });
        o.material = Array.isArray(o.material) ? list : list[0];
    });
    const glow = makeTexturesGlow(v2, { Cube12_auv: 0.33, console_auv: 0.64 });
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

    // Parado ao lado do núcleo (o pedestal tem raio 1,5 m), virado para ele
    spawnRobot(robots, robotGltf, mixers, { x: -7.5, z: -2.4, rotY: 0, clip: 'Idle' });

    // Segue o jogador
    const followerRobot = spawnRobot(robots, robotGltf, mixers, { x: -3, z: 0.5, clip: 'Idle' });
    const follower = makeFollower(followerRobot, robotGltf);

    // Servidor em destaque ao lado do núcleo (glTF).
    // Pesado (459 malhas, ~312 mil triângulos): não projeta sombra para não ser
    // desenhado de novo nos shadow maps das SpotLights.
    const featured = await loadServerGLTF(); // 13 MB: a primeira carga demora um pouco
    fitToHeight(featured, 2.2); // mesma altura dos outros servidores
    featured.rotation.y = Math.PI; // frente (LEDs) virada para -Z, ou seja, para o núcleo e o corredor
    featured.position.set(-7.5, 0, 4);
    // A origem do modelo não fica na base: ele flutuava ~15 cm acima do piso.
    // Medimos a caixa envolvente já na posição final e descemos até y = 0.
    const box = new THREE.Box3().setFromObject(featured);
    featured.position.y -= box.min.y;
    featured.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
    });
    servers.add(featured);

    // Luz de destaque: o modelo não tem textura e os materiais são escuros (metal preto),
    // e o canto onde ele fica não recebe as SpotLights do corredor. Sem esta luz ele
    // vira uma silhueta preta. Ela vem do teto, à frente do servidor, inclinada para ele.
    // Sem sombra: é só um realce, e evita mais uma passada de shadow map.
    const featuredLight = new THREE.SpotLight(0xd6ecff, 60, 0, THREE.MathUtils.degToRad(25), 0.5, 2);
    featuredLight.position.set(-7.5, 4.8, 2.2);
    featuredLight.target.position.set(-7.5, 1.1, 4);
    featuredLight.castShadow = false;
    servers.add(featuredLight, featuredLight.target);

    return { mixers, glow, follower };
}
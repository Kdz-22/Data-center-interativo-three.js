import * as THREE from 'three';
import { createPedestalMaterial, createGlassShellMaterial, createOrbEmissiveMap } from './coreMaterials.js';

export function createAICore() {
    const params = {
        color: '#00e5ff',
        lightIntensity: 40, // candelas (unidades físicas, decay = 2)
        emissive: 2.0,      // brilho do material
        pulse: 0.2,         // amplitude da pulsação
        speed: 2.0,         // rad/s
        flowSpeed: 0.15,    // M3: velocidade do fluxo de dados na esfera (repetições de UV por segundo)
        pedestalGlow: 1.2,  // M3: brilho das trilhas do pedestal
    };

    const group = new THREE.Group();
    group.name = 'ai-core';

    // Pedestal de metal escuro, dá contraste ao brilho.
    // M3: trilhas de circuito emissivas na mesma cor do núcleo (src/coreMaterials.js)
    const pedestalMat = createPedestalMaterial(params.color);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.5, 48), pedestalMat);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;

    // Esfera emissiva
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x001a22,
        emissive: new THREE.Color(params.color),
        emissiveIntensity: params.emissive,
        roughness: 0.3,
        metalness: 0.2,
    });
    // M3: o emissivo da esfera passa a ter um mapa (faixas de "dados") que corre pela superfície.
    // emissive (ciano) × emissiveMap (cinza com faixas brancas) = ciano com faixas mais fortes.
    const orbMap = createOrbEmissiveMap();
    coreMat.emissiveMap = orbMap;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), coreMat);
    orb.position.y = 1.9;

    // Casca de vidro em volta da esfera (raio 0,85: entre a esfera e os anéis)
    const shellMat = createGlassShellMaterial();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 32), shellMat);
    shell.position.copy(orb.position);
    shell.castShadow = false; // vidro quase transparente não deve fazer sombra sólida
    shell.renderOrder = 1;    // desenhado depois do interior (objetos transparentes vão por último)

    // Anéis emissivos (compartilham o material)
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0x001a22,
        emissive: new THREE.Color(params.color),
        emissiveIntensity: 1.5,
        roughness: 0.4,
        metalness: 0.5,
    });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 16, 96), ringMat);
    ringA.position.copy(orb.position);
    const electronAPivot = new THREE.Group();
    const electronA = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), ringMat);
    electronA.position.x = 1.1; // mesmo raio do ringA
    electronAPivot.add(electronA);
    ringA.add(electronAPivot);
    // Anel horizontal. Um torus completo girando no próprio eixo é simétrico e pareceria
    // parado; a esfera (elétron) presa a ele é o que deixa a rotação visível.
    const ringB = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.04, 16, 96),
        ringMat
    );
    ringB.rotation.x = Math.PI / 2; // deita o anel no plano XZ (horizontal)

    const electronBPivot = new THREE.Group();
    const electronB = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), ringMat);
    electronB.position.x = 1.1; // mesmo raio do ringB
    electronBPivot.add(electronB);
    ringB.add(electronBPivot);
    // Pivô: o anel fica deitado dentro dele e o pivô gira em Y,
    // evitando confusão com a ordem dos ângulos de Euler
    const ringBPivot = new THREE.Group();
    ringBPivot.position.copy(orb.position);
    ringBPivot.add(ringB);

    // Anel atômico: pivô externo faz a precessão (Y), o grupo interno fixa a inclinação,
    // e o elétron orbita ao longo do anel girando em torno da normal do anel (Z local)
    const ringCPivot = new THREE.Group();
    ringCPivot.position.copy(orb.position);

    const ringCTilt = new THREE.Group();
    ringCTilt.rotation.x = Math.PI / 3; // 60° de inclinação: cruza os outros dois anéis

    const ringC = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 16, 96), ringMat);

    const electronPivot = new THREE.Group();
    const electron = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), ringMat);
    electron.position.x = 1.3; // mesmo raio do anel
    electronPivot.add(electron);

    ringCTilt.add(ringC, electronPivot);
    ringCPivot.add(ringCTilt);

    // A luz de verdade: o material emissivo sozinho NÃO ilumina os outros objetos
    const light = new THREE.PointLight(params.color, params.lightIntensity, 14, 2);
    light.position.copy(orb.position);
    light.castShadow = false; // sombra de PointLight = 6 passadas (cubemap); ver JUSTIFICATIVAS.md

    group.add(base, orb, shell, ringA, ringBPivot, ringCPivot, light);

    // Chamar uma vez por quadro, com o delta do THREE.Timer
    function update(elapsed, delta) {
        const k = 1 + params.pulse * Math.sin(elapsed * params.speed);
        light.intensity = params.lightIntensity * k;
        coreMat.emissiveIntensity = params.emissive * k;
        pedestalMat.emissiveIntensity = params.pedestalGlow * k; // trilhas pulsam junto com o núcleo
        // Animação de UV: deslocar o offset faz a textura "escorregar" sobre a malha,
        // sem mexer em nenhum vértice. O % 1 evita que o número cresça para sempre
        // (com RepeatWrapping, offset 1,0 é igual a 0,0).
        orbMap.offset.y = (orbMap.offset.y + params.flowSpeed * delta) % 1;
        orb.rotation.y += 0.5 * delta;   // rad/s, independente de frame rate
        ringA.rotation.y += 0.8 * delta;
        ringBPivot.rotation.x -= 0.8 * delta;
        ringCPivot.rotation.y += 0.4 * delta;
        electronPivot.rotation.z += 2.5 * delta;
        electronAPivot.rotation.z += 2.0 * delta;
        electronBPivot.rotation.z -= 1.6 * delta;
    }

    return { group, light, coreMat, ringMat, pedestalMat, shell, shellMat, params, update };
}

// Pasta no lil-gui (use o mesmo objeto gui que já existe no projeto)
export function addAICoreGui(gui, core) {
    const f = gui.addFolder('Núcleo de IA');
    f.addColor(core.params, 'color').name('cor').onChange((c) => {
        core.light.color.set(c);
        core.coreMat.emissive.set(c);
        core.ringMat.emissive.set(c);
        core.pedestalMat.emissive.set(c); // trilhas do pedestal acompanham a cor do núcleo
    });
    f.add(core.params, 'lightIntensity', 0, 150).name('intensidade da luz');
    f.add(core.params, 'emissive', 0, 6).name('brilho emissivo');
    f.add(core.light, 'distance', 0, 30).name('alcance (distance)');
    f.add(core.light, 'decay', 0, 4).name('decay');
    f.add(core.params, 'pulse', 0, 0.8).name('pulsação');
    f.add(core.params, 'speed', 0, 8).name('velocidade (rad/s)');

    // M3: materiais do núcleo
    const fm = f.addFolder('Materiais do núcleo');
    fm.add(core.params, 'flowSpeed', -1, 1, 0.01).name('fluxo de dados (UV/s)');
    fm.add(core.params, 'pedestalGlow', 0, 4, 0.05).name('brilho das trilhas');
    fm.add(core.pedestalMat, 'roughness', 0, 1, 0.01).name('pedestal: roughness');
    fm.add(core.pedestalMat, 'metalness', 0, 1, 0.01).name('pedestal: metalness');
    fm.add(core.shell, 'visible').name('casca de vidro');
    fm.add(core.shellMat, 'opacity', 0, 1, 0.01).name('vidro: opacidade');
    fm.add(core.shellMat, 'roughness', 0, 1, 0.01).name('vidro: roughness');
    fm.add(core.shellMat, 'clearcoat', 0, 1, 0.01).name('vidro: clearcoat');
    fm.add(core.shellMat, 'ior', 1, 2.33, 0.01).name('vidro: ior');
    fm.close();
    return f;
}
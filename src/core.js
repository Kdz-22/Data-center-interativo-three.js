import * as THREE from 'three';

export function createAICore() {
    const params = {
        color: '#00e5ff',
        lightIntensity: 40, // candelas (unidades físicas, decay = 2)
        emissive: 2.0,      // brilho do material
        pulse: 0.2,         // amplitude da pulsação
        speed: 2.0,         // rad/s
    };

    const group = new THREE.Group();
    group.name = 'ai-core';

    // Pedestal escuro (não emissivo), dá contraste ao brilho
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.5, 0.5, 48),
        new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.35, metalness: 0.85 })
    );
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
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), coreMat);
    orb.position.y = 1.9;

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
    light.castShadow = false; // sombra de PointLight = 6 passadas (cubemap); ver JUSTIFICATIVAS.md
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
    light.castShadow = false; // justificativa no Passo 6

    group.add(base, orb, ringA, ringBPivot, ringCPivot, light);

    // Chamar uma vez por quadro, com o delta do THREE.Timer
    function update(elapsed, delta) {
        const k = 1 + params.pulse * Math.sin(elapsed * params.speed);
        light.intensity = params.lightIntensity * k;
        coreMat.emissiveIntensity = params.emissive * k;
        orb.rotation.y += 0.5 * delta;   // rad/s, independente de frame rate
        ringA.rotation.y += 0.8 * delta;
        ringBPivot.rotation.x -= 0.8 * delta;
        ringCPivot.rotation.y += 0.4 * delta;
        electronPivot.rotation.z += 2.5 * delta;
        electronAPivot.rotation.z += 2.0 * delta;
        electronBPivot.rotation.z -= 1.6 * delta;
    }

    return { group, light, coreMat, ringMat, params, update };
}

// Pasta no lil-gui (use o mesmo objeto gui que já existe no projeto)
export function addAICoreGui(gui, core) {
    const f = gui.addFolder('Núcleo de IA');
    f.addColor(core.params, 'color').name('cor').onChange((c) => {
        core.light.color.set(c);
        core.coreMat.emissive.set(c);
        core.ringMat.emissive.set(c);
    });
    f.add(core.params, 'lightIntensity', 0, 150).name('intensidade da luz');
    f.add(core.params, 'emissive', 0, 6).name('brilho emissivo');
    f.add(core.light, 'distance', 0, 30).name('alcance (distance)');
    f.add(core.light, 'decay', 0, 4).name('decay');
    f.add(core.params, 'pulse', 0, 0.8).name('pulsação');
    f.add(core.params, 'speed', 0, 8).name('velocidade (rad/s)');
    return f;
}
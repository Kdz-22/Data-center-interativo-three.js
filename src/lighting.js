import * as THREE from 'three';

// SpotLights do teto + configuração das sombras.
//
// Ideia: luminárias embutidas no teto, em fila sobre o corredor central, apontando
// para baixo. Cada uma ilumina um "cone" do corredor e deixa os cantos e as paredes
// no escuro, o que valoriza o brilho do núcleo de IA e dos LEDs (parte do Kevin).
//
// Por que SpotLight (e não DirectionalLight ou PointLight):
//  - DirectionalLight imita o sol: raios paralelos que iluminam a sala inteira por igual.
//    Dentro de uma sala fechada isso não faz sentido físico e apagaria o clima escuro.
//  - PointLight ilumina em todas as direções e, para sombra, precisa renderizar a cena
//    6 vezes por quadro (um cubemap). Já usamos uma no núcleo, sem sombra.
//  - SpotLight tem cone (angle + penumbra), cai com a distância (decay) e a sombra dela
//    custa UMA passada extra por luz, com uma câmera em perspectiva igual à nossa.

// Posições das luminárias (m). O corredor vai de x ≈ -5,2 a 5,2, em z = 0.
const FIXTURES_X = [-4.2, 0, 4.2];
const CEILING_GAP = 0.15; // luminária um pouco abaixo do teto, para não "entrar" no plano dele

export function createCeilingSpotLights(scene, room) {
    const params = {
        color: '#d6ecff',          // branco frio: combina com o azul do núcleo sem tingir tudo
        intensity: 160,            // candelas (unidades físicas, decay = 2)
        angleDeg: 38,              // metade da abertura do cone
        penumbra: 0.45,            // 0 = borda dura; 1 = borda totalmente esfumada
        decay: 2,                  // queda com o inverso do quadrado da distância (físico)
        castShadow: true,
        mapSize: 1024,
        bias: -0.0005,
        normalBias: 0.02,
        radius: 4,
        showHelpers: false,
    };

    const y = room.height - CEILING_GAP;
    const group = new THREE.Group();
    group.name = 'ceiling-lights';

    // Luminária visível: um painel emissivo no teto. Ele NÃO ilumina nada
    // (emissivo só faz o próprio objeto parecer aceso); quem ilumina é a SpotLight.
    // Ele só existe para a luz ter uma fonte visível, senão o chão ficaria iluminado
    // por "nada".
    const panelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 32);
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x111418,
        emissive: new THREE.Color(params.color),
        emissiveIntensity: 2.5,
    });

    const lights = [];
    const helpers = [];

    for (const x of FIXTURES_X) {
        const light = new THREE.SpotLight(params.color, params.intensity);
        light.position.set(x, y, 0);
        light.angle = THREE.MathUtils.degToRad(params.angleDeg);
        light.penumbra = params.penumbra;
        light.decay = params.decay;
        light.distance = 0; // 0 = sem corte; com decay 2 a própria queda já apaga a luz

        // O alvo define para onde o cone aponta. Ele PRECISA estar na cena,
        // senão a matriz dele não é atualizada e a luz aponta para a origem.
        light.target.position.set(x, 0, 0);
        group.add(light.target);

        configureShadow(light, params);
        group.add(light);
        lights.push(light);

        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(x, room.height - 0.02, 0);
        panel.castShadow = false;   // o painel fica acima da luz; se projetasse sombra, taparia o cone
        panel.receiveShadow = false;
        group.add(panel);

        // Helpers para a arguição: o cone da luz e o frustum da câmera de sombra
        const coneHelper = new THREE.SpotLightHelper(light);
        const shadowHelper = new THREE.CameraHelper(light.shadow.camera);
        coneHelper.visible = shadowHelper.visible = false;
        scene.add(coneHelper, shadowHelper);
        helpers.push(coneHelper, shadowHelper);
    }

    scene.add(group);

    function apply() {
        for (const light of lights) {
            light.color.set(params.color);
            light.intensity = params.intensity;
            light.angle = THREE.MathUtils.degToRad(params.angleDeg);
            light.penumbra = params.penumbra;
            light.decay = params.decay;
            configureShadow(light, params);
        }
        panelMat.emissive.set(params.color);
        for (const h of helpers) {
            h.visible = params.showHelpers;
            h.update();
        }
    }

    return { group, lights, params, apply, helpers };
}

function configureShadow(light, p) {
    light.castShadow = p.castShadow;

    const shadow = light.shadow;

    // Resolução do shadow map (textura de profundidade vista pela luz).
    // 1024 é o equilíbrio: 512 deixa a borda das sombras serrilhada nos racks;
    // 2048 quadruplica a memória e o custo de leitura sem diferença visível a 1,7 m de altura.
    if (shadow.mapSize.x !== p.mapSize) {
        shadow.mapSize.set(p.mapSize, p.mapSize);
        // A textura antiga tem o tamanho velho: descartamos para o Three.js criar outra.
        if (shadow.map) {
            shadow.map.dispose();
            shadow.map = null;
        }
    }

    // Câmera de sombra: near/far o mais justos possível.
    // A luz está a ~4,85 m do chão; na borda do cone a distância é 4,85 / cos(38°) ≈ 6,2 m.
    // far = 7 cobre isso. Quanto menor o intervalo near–far, mais precisão de profundidade
    // por metro, e menos artefatos (é o mesmo raciocínio do near/far da câmera principal).
    shadow.camera.near = 0.5;
    shadow.camera.far = 7;
    // A SpotLightShadow ajusta o fov da câmera de sombra pelo angle da luz a cada quadro.
    shadow.camera.updateProjectionMatrix();

    // bias: empurra a comparação de profundidade um pouco para longe da luz.
    //   Sem ele aparece "shadow acne" (listras de sombra na própria superfície).
    //   Exagerado, a sombra "descola" do objeto (peter-panning).
    // normalBias: desloca ao longo da normal; resolve acne em superfícies inclinadas
    //   em relação à luz (laterais dos racks) com menos descolamento que o bias.
    shadow.bias = p.bias;
    shadow.normalBias = p.normalBias;

    // radius: tamanho do filtro PCF. Borda da sombra mais suave, como numa luminária
    // real (que não é um ponto). Só funciona com PCFShadowMap.
    shadow.radius = p.radius;
}

// Pasta no mesmo lil-gui do diagnóstico
export function addSpotLightGui(gui, spots, renderer) {
    const f = gui.addFolder('SpotLights e sombras');
    const p = spots.params;
    const apply = spots.apply;

    f.add(p, 'castShadow').name('projetar sombras').onChange(apply);
    f.addColor(p, 'color').name('cor').onChange(apply);
    f.add(p, 'intensity', 0, 200, 1).name('intensidade (cd)').onChange(apply);
    f.add(p, 'angleDeg', 10, 70, 1).name('ângulo do cone (°)').onChange(apply);
    f.add(p, 'penumbra', 0, 1, 0.01).name('penumbra').onChange(apply);
    f.add(p, 'decay', 0, 3, 0.1).name('decay').onChange(apply);

    const fs = f.addFolder('Shadow map');
    fs.add(p, 'mapSize', [256, 512, 1024, 2048]).name('resolução').onChange(apply);
    fs.add(p, 'bias', -0.005, 0.005, 0.0001).name('bias').onChange(apply);
    fs.add(p, 'normalBias', 0, 0.1, 0.001).name('normalBias').onChange(apply);
    fs.add(p, 'radius', 0, 10, 0.5).name('suavização (radius)').onChange(apply);
    fs.add(p, 'showHelpers').name('mostrar cones / câmeras').onChange(apply);
    fs.add(renderer.shadowMap, 'autoUpdate').name('atualizar todo quadro');

    return f;
}
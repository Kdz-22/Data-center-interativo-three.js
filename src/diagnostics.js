import * as THREE from 'three';
import GUI from 'lil-gui';

// Modo diagnóstico do pipeline (seção 3.3 do enunciado).
// Cada item pode ser ligado pelo painel lil-gui ou pelas teclas 1 a 5:
//
//   1. Wireframe ........................ material.wireframe
//   2. Profundidade ..................... scene.overrideMaterial = MeshDepthMaterial
//   3. Back-face culling ................ material.side (FrontSide x DoubleSide)
//   4. Frustum (visão de cima) .......... CameraHelper visto por uma 2ª câmera, em viewport menor
//   5. Contadores do renderer.info ...... draw calls e triângulos, com e sem frustumCulled
//
// Este módulo também é dono da renderização (função render), porque precisa
// desenhar duas viewports e medir só a da câmera principal.

// Camadas (layers): cada câmera só desenha os objetos das camadas que ela habilita.
// O CameraHelper fica na camada 1, que só a câmera de cima enxerga.
// Sem isso, as linhas do frustum apareceriam na frente da câmera principal.
const HELPER_LAYER = 1;

export function createDiagnostics({ scene, renderer, camera, controller, room }) {
    const state = {
        // 1
        wireframe: false,
        // 2
        depthView: false,
        // 3
        backfaceCulling: true,
        // 4
        showFrustum: true,
        // 5
        frustumCulling: true,
        // câmera (near/far afetam a profundidade e o frustum)
        near: camera.near,
        far: camera.far,
        fov: camera.fov,
    };

    // Valores só para exibição (atualizados todo quadro, painel em modo .listen())
    const stats = { drawCalls: 0, triangles: 0, lines: 0, meshes: 0, fps: 0 };

    // ---------------------------------------------------------------- 2. Profundidade
    // MeshDepthMaterial pinta cada pixel pelo valor do z-buffer:
    // branco = perto do near, preto = perto do far.
    // O z-buffer de uma câmera em perspectiva NÃO é linear: quase toda a precisão
    // fica perto do near. Com near muito pequeno e far muito grande, a cena inteira
    // aparece quase preta. Os sliders near/far permitem ver isso acontecendo.
    const depthMaterial = new THREE.MeshDepthMaterial();

    // ---------------------------------------------------------------- 4. Segunda câmera
    // Câmera ortográfica olhando de cima para baixo, enquadrando a sala inteira.
    // Ortográfica porque, numa planta baixa, não queremos perspectiva distorcendo o frustum.
    const halfW = room.width / 2 + 1;
    const halfD = room.depth / 2 + 1;
    const topCamera = new THREE.OrthographicCamera(-halfW, halfW, halfD, -halfD, 0.1, 100);
    topCamera.position.set(0, 30, 0);
    topCamera.up.set(0, 0, -1); // -Z para cima na tela (o "norte" da planta)
    topCamera.lookAt(0, 0, 0);
    topCamera.layers.enable(HELPER_LAYER);

    // CameraHelper desenha as 4 arestas e os planos near/far do frustum da câmera principal.
    const cameraHelper = new THREE.CameraHelper(camera);
    cameraHelper.layers.set(HELPER_LAYER);
    scene.add(cameraHelper);

    // ---------------------------------------------------------------- aplicar estados
    // Percorre todos os materiais da cena. Os racks são clones que compartilham material,
    // então cada material aparece várias vezes: o Set evita processar o mesmo duas vezes.
    function forEachMaterial(fn) {
        const seen = new Set();
        scene.traverse((obj) => {
            if (!obj.isMesh) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
                if (m && !seen.has(m)) {
                    seen.add(m);
                    fn(m);
                }
            }
        });
    }

    function applyWireframe() {
        forEachMaterial((m) => { m.wireframe = state.wireframe; });
        depthMaterial.wireframe = state.wireframe; // vale também no modo profundidade
    }

    function applyDepthView() {
        // overrideMaterial: TODOS os objetos são desenhados com este material,
        // sem precisar trocar o material de cada malha.
        scene.overrideMaterial = state.depthView ? depthMaterial : null;
    }

    function applyCulling() {
        // FrontSide: o WebGL descarta os triângulos vistos de costas (culling ligado).
        // DoubleSide: desenha os dois lados (culling desligado).
        // Mudar side recompila o shader, por isso o needsUpdate.
        const side = state.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide;
        forEachMaterial((m) => {
            m.side = side;
            m.needsUpdate = true;
        });
        depthMaterial.side = side;
        depthMaterial.needsUpdate = true;
    }

    function applyFrustumCulling() {
        // frustumCulled = true: antes de desenhar, o Three.js testa a bounding sphere
        // do objeto contra o frustum da câmera e pula quem está fora (economiza draw calls).
        // false: tudo é enviado à GPU, mesmo o que está atrás da câmera.
        let count = 0;
        scene.traverse((obj) => {
            if (obj.isMesh) {
                obj.frustumCulled = state.frustumCulling;
                count++;
            }
        });
        stats.meshes = count;
    }

    function applyCamera() {
        camera.near = state.near;
        camera.far = Math.max(state.far, state.near + 0.1);
        camera.fov = state.fov;
        camera.updateProjectionMatrix();
        cameraHelper.update();
    }

    // Reaplica tudo. Chamado de novo quando os modelos terminam de carregar,
    // porque eles chegam depois de o painel já existir.
    function refresh() {
        applyWireframe();
        applyDepthView();
        applyCulling();
        applyFrustumCulling();
        applyCamera();
    }

    // ---------------------------------------------------------------- painel
    const gui = new GUI({ title: 'Modo diagnóstico' });

    const fPipe = gui.addFolder('Pipeline');
    const cWire = fPipe.add(state, 'wireframe').name('1 · Wireframe').onChange(applyWireframe);
    const cDepth = fPipe.add(state, 'depthView').name('2 · Profundidade').onChange(applyDepthView);
    const cCull = fPipe.add(state, 'backfaceCulling').name('3 · Back-face culling').onChange(applyCulling);
    const cFrus = fPipe.add(state, 'showFrustum').name('4 · Frustum (vista de cima)');

    const fCam = gui.addFolder('Câmera principal');
    fCam.add(state, 'near', 0.01, 5, 0.01).name('near (m)').onChange(applyCamera);
    fCam.add(state, 'far', 1, 200, 0.5).name('far (m)').onChange(applyCamera);
    fCam.add(state, 'fov', 30, 100, 1).name('fov (°)').onChange(applyCamera);
    fCam.add(controller, 'walkSpeed', 0.5, 10, 0.1).name('velocidade (m/s)');
    fCam.add(controller, 'keepInside').name('prender na sala');

    const fInfo = gui.addFolder('5 · renderer.info');
    const cFC = fInfo.add(state, 'frustumCulling').name('frustumCulled').onChange(applyFrustumCulling);
    fInfo.add(stats, 'drawCalls').name('draw calls').listen().disable();
    fInfo.add(stats, 'triangles').name('triângulos').listen().disable();
    fInfo.add(stats, 'lines').name('linhas').listen().disable();
    fInfo.add(stats, 'meshes').name('malhas na cena').listen().disable();
    fInfo.add(stats, 'fps').name('fps').listen().disable();

    // Atalhos de teclado 1–5 (funcionam com o mouse capturado, quando não dá para clicar no painel)
    const shortcuts = { Digit1: cWire, Digit2: cDepth, Digit3: cCull, Digit4: cFrus, Digit5: cFC };
    addEventListener('keydown', (e) => {
        const ctrl = shortcuts[e.code];
        if (!ctrl || e.target.tagName === 'INPUT') return;
        ctrl.setValue(!ctrl.getValue()); // setValue dispara o onChange e atualiza o painel
    });
    // H esconde/mostra o painel (útil para gravar o vídeo)
    let guiVisible = true;
    addEventListener('keydown', (e) => {
        if (e.code !== 'KeyH' || e.target.tagName === 'INPUT') return;
        guiVisible = !guiVisible;
        gui.show(guiVisible);
    });

    // Moldura e legenda da viewport de cima (só HTML por cima do canvas, não entra no WebGL)
    const insetFrame = document.createElement('div');
    insetFrame.className = 'inset-frame';
    insetFrame.innerHTML = '<span>Câmera 2 · vista de cima (frustum da câmera principal)</span>';
    document.body.appendChild(insetFrame);

    // ---------------------------------------------------------------- render
    // renderer.info soma tudo o que foi desenhado desde o último reset.
    // Como desenhamos duas viewports por quadro, desligamos o autoReset e zeramos
    // manualmente, lendo os números logo depois da viewport principal:
    // assim o contador mostra só o custo da câmera de primeira pessoa.
    renderer.info.autoReset = false;
    renderer.setScissorTest(false);

    const size = new THREE.Vector2();
    let fpsAccum = 0;
    let fpsFrames = 0;

    function render(delta) {
        renderer.getSize(size);
        const w = size.x;
        const h = size.y;

        // Viewport principal (tela inteira)
        renderer.info.reset();
        renderer.setViewport(0, 0, w, h);
        renderer.setScissor(0, 0, w, h);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);
        stats.drawCalls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
        stats.lines = renderer.info.render.lines; // em wireframe a GPU desenha linhas, não triângulos

        // Viewport menor no canto inferior esquerdo: planta da sala vista de cima,
        // com o frustum da câmera principal desenhado pelo CameraHelper.
        cameraHelper.visible = state.showFrustum;
        insetFrame.style.display = state.showFrustum ? 'block' : 'none';
        if (state.showFrustum) {
            const insetW = Math.round(Math.min(w * 0.32, 420));
            const insetH = Math.round(insetW * (halfD / halfW)); // mesma proporção da sala
            const margin = 16;
            // setViewport conta y de baixo para cima; o CSS conta "bottom" igual, então bate.
            Object.assign(insetFrame.style, {
                left: `${margin}px`, bottom: `${margin}px`, width: `${insetW}px`, height: `${insetH}px`,
            });

            cameraHelper.update();
            renderer.setViewport(margin, margin, insetW, insetH);
            renderer.setScissor(margin, margin, insetW, insetH);
            renderer.render(scene, topCamera);
        }
        renderer.setScissorTest(false);

        // fps médio a cada meio segundo (só para leitura no painel)
        fpsAccum += delta;
        fpsFrames++;
        if (fpsAccum >= 0.5) {
            stats.fps = Math.round(fpsFrames / fpsAccum);
            fpsAccum = 0;
            fpsFrames = 0;
        }
    }

    refresh();
    return { gui, state, stats, topCamera, cameraHelper, refresh, render };
}
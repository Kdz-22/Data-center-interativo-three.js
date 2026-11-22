import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Pós-processamento: bloom (brilho que "vaza" das partes mais claras da imagem).
//
// Por que: o material emissivo só deixa o próprio objeto claro; ele não tem o halo
// que uma luz forte tem quando vista por um olho ou uma câmera de verdade.
// O bloom simula esse halo, e é ele que faz o núcleo, os LEDs, os painéis do teto
// e o fluido dos tubos parecerem acesos de verdade.
//
// Como funciona (cadeia de passes do EffectComposer):
//  1. RenderPass: desenha a cena numa textura (render target) em vez da tela.
//     A textura é HalfFloat, então guarda valores acima de 1 (HDR) sem cortar.
//  2. UnrealBloomPass: separa só os pixels acima do threshold, borra essa imagem
//     em vários tamanhos (mipmaps) e soma de volta por cima da cena.
//  3. OutputPass: aplica o tone mapping (ACES) e a conversão para sRGB.
//     Sem o composer o renderer faz isso sozinho; com ele, precisa ser o último passe.
export function createPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer); // já usa o tamanho e o pixelRatio do renderer

  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(
    size,
    0.55, // strength: força do halo
    0.4,  // radius: o quanto o halo se espalha
    0.85  // threshold: só brilha o que passa deste valor (em HDR, antes do tone mapping)
  );
  // threshold 0.85: o piso e as paredes iluminados ficam abaixo disso e não "embaçam";
  // só os emissivos (núcleo, LEDs, painéis do teto, tubos) passam e ganham halo.

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const params = { enabled: true };

  return {
    composer,
    bloom,
    params,
    render() {
      composer.render();
    },
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
  };
}

export function addBloomGui(gui, post) {
  const f = gui.addFolder('Bloom (pós-processamento)');
  f.add(post.params, 'enabled').name('ligado');
  f.add(post.bloom, 'strength', 0, 2, 0.01).name('força');
  f.add(post.bloom, 'radius', 0, 1, 0.01).name('raio');
  f.add(post.bloom, 'threshold', 0, 2, 0.01).name('limiar (threshold)');
  return f;
}

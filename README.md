# Data Center Futurista em Three.js

Sala de um data center imaginado para 2050, explorável em primeira pessoa.
O estilo é de maquete 3D (diorama), mas com aparência próxima de um data center real.

Projeto da disciplina de Computação Gráfica, feito por **Letícia Rosa Teles** e **Kevin Domingues Zili**.

A cena tem quatro elementos principais:

- **Racks de servidores**: duas fileiras de 14 unidades, com um corredor central entre elas.
- **Sistema de resfriamento líquido**: um circuito frio (ciano) e um quente (laranja), com o fluido correndo dentro dos tubos.
- **Núcleo de IA**: esfera emissiva com anéis orbitais, dentro de uma cápsula de vidro, sobre um pedestal com trilhas de circuito.
- **Robôs de manutenção**: um parado ao lado do núcleo e outro que segue o visitante pela sala.

O escopo segue o M0: uma única sala fechada de 20 × 14 m e 5 m de altura. Não há mecânicas de jogo, física nem colisão com os objetos. A câmera só fica presa dentro das paredes.

## Como executar

É preciso ter o [Node.js](https://nodejs.org) 20.19 ou mais recente.

    npm install
    npm run dev

Depois abra o endereço que aparece no terminal (normalmente `http://localhost:5173`).
O servidor em destaque ao lado do núcleo tem cerca de 13 MB, então a primeira carga pode levar alguns segundos.

Para gerar a versão de produção:

    npm run build
    npm run preview

## Controles

| Tecla | Ação |
| --- | --- |
| Clique na cena | captura o mouse e ativa os controles |
| `W` `A` `S` `D` | andar |
| `Shift` | correr |
| Mouse ou setas | olhar em volta |
| `Esc` | solta o mouse (para usar o painel) |
| `1` a `5` | liga e desliga os itens do modo diagnóstico |
| `H` | esconde e mostra o painel lil-gui |

O movimento não depende do frame rate: todas as velocidades estão em m/s ou rad/s e são multiplicadas pelo `delta` do `THREE.Timer`.

## Técnicas de Computação Gráfica

### M1: estrutura e modelos
- Projeto com Vite e Three.js, câmera em perspectiva com `near`/`far` justificados pelo tamanho da sala.
- Navegação em primeira pessoa com `PointerLockControls`, independente de frame rate ([src/firstPerson.js](src/firstPerson.js)).
- Modelos externos em OBJ (com e sem MTL), GLB e glTF, escalados pela altura real em metros ([src/loaders.js](src/loaders.js)).
- Clonagem de modelos que compartilham geometria e material, e `SkeletonUtils.clone` para os robôs com esqueleto ([src/datacenter.js](src/datacenter.js)).
- **Modo diagnóstico** ([src/diagnostics.js](src/diagnostics.js)):
  1. wireframe;
  2. visualização do z-buffer (`MeshDepthMaterial`);
  3. back-face culling;
  4. frustum da câmera principal visto por uma segunda câmera, em outra viewport;
  5. contadores do `renderer.info` (draw calls, triângulos, fps), com e sem `frustumCulled`.

### M2: iluminação
- Três SpotLights no teto com shadow map PCF, com `bias`, `normalBias`, resolução e câmera de sombra ajustados ([src/lighting.js](src/lighting.js)).
- PointLight no núcleo de IA, sincronizada com o material emissivo e sem sombra por desempenho ([src/core.js](src/core.js)).
- Materiais emissivos nos LEDs e telas dos servidores, usando a própria textura como `emissiveMap` ([src/emissive.js](src/emissive.js)).
- Tone mapping ACES Filmic e luz base com `HemisphereLight`.

### M3: materiais e efeitos
- Texturas procedurais desenhadas em `<canvas>` para o piso elevado, as paredes e o teto, com mapeamento UV em escala real (`repeat`), `bumpMap` e `roughnessMap` ([src/materials.js](src/materials.js)).
- Environment map pré-filtrado (`PMREMGenerator` + `RoomEnvironment`), que dá reflexo aos materiais metálicos.
- Núcleo de IA: pedestal com trilhas de circuito emissivas, cápsula de vidro com `MeshPhysicalMaterial` (clearcoat, ior) e fluxo de dados animado por deslocamento de UV ([src/coreMaterials.js](src/coreMaterials.js)).
- Materiais dos modelos convertidos para PBR, com UV gerado por projeção em caixa, bump e rugosidade de metal escovado ([src/loaders.js](src/loaders.js)).
- Tubos de resfriamento com o pulso do fluido animado por offset de UV, em sentidos opostos no circuito frio e no quente ([src/cooling.js](src/cooling.js)).
- Animações dos robôs com `AnimationMixer`, com transição suave (`crossFadeTo`) entre Idle e Walking no robô que segue o jogador.

### M4: finalização
- Bloom com `EffectComposer` + `UnrealBloomPass` + `OutputPass`, aplicado só nas partes emissivas ([src/postprocessing.js](src/postprocessing.js)).
- Névoa exponencial (`FogExp2`) para dar profundidade à sala ([src/main.js](src/main.js)).
- Fitas de LED emissivas no corredor, com pulsos animados por UV em direção ao núcleo, e no perímetro do teto ([src/ledStrips.js](src/ledStrips.js)).

As decisões e os valores escolhidos estão explicados em [JUSTIFICATIVAS.md](JUSTIFICATIVAS.md).

## Painel lil-gui

Tudo fica em um único painel, **Modo diagnóstico**:

| Pasta | O que controla |
| --- | --- |
| Pipeline | wireframe, profundidade, back-face culling, frustum |
| Câmera principal | near, far, fov, velocidade, limite da sala |
| 5 · renderer.info | `frustumCulled` e contadores |
| Núcleo de IA | cor, luz, brilho, pulsação; subpasta com os materiais do núcleo |
| SpotLights e sombras | cor, intensidade, cone, penumbra; subpasta do shadow map |
| Materiais do ambiente | reflexos, texturas ligadas/desligadas, piso, paredes e teto |
| Bloom (pós-processamento) | liga/desliga, força, raio e limiar do bloom |
| Fitas de LED | cor, brilho do piso e do teto, velocidade dos pulsos |
| Luz base | luz hemisférica e exposição |
| Névoa | liga/desliga, densidade e cor |
| Materiais emissivos | brilho dos LEDs e da tela do console |

## Estrutura do projeto

```
index.html            HUD com os controles e a mensagem de carregamento
src/
  main.js             cena, renderer, câmera, luz base, névoa e loop principal (integração)
  room.js             sala de 20 × 14 × 5 m
  materials.js        texturas procedurais, environment map e painel dos materiais do ambiente
  datacenter.js       fileiras de servidores, robôs e servidor em destaque
  loaders.js          carregamento dos modelos OBJ, GLB e glTF
  cooling.js          tubos de resfriamento líquido
  core.js             núcleo de IA (geometria, luz e animação)
  coreMaterials.js    materiais do núcleo de IA
  emissive.js         materiais emissivos dos servidores
  lighting.js         SpotLights do teto e sombras
  ledStrips.js        fitas de LED do corredor e do teto
  postprocessing.js   bloom (EffectComposer)
  firstPerson.js      navegação em primeira pessoa
  diagnostics.js      modo diagnóstico e renderização das duas viewports
  style.css           HUD e moldura da segunda viewport
public/               modelos 3D e suas texturas
```

## Modelos 3D e licenças

| Modelo | Uso na cena | Autor | Licença |
| --- | --- | --- | --- |
| [Server Rack](https://opengameart.org/) (OBJ) | racks das fileiras | HippoDevelopment | CC BY-SA 4.0 |
| [RobotExpressive](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) (GLB) | robôs de manutenção | Tomás Laulhé, modificações de Don McCurdy | CC0 1.0 |
| [Server Racking System](https://sketchfab.com/3d-models/server-racking-system-6fe2cacf836b4aed96c650b286db5486) (glTF) | servidor em destaque ao lado do núcleo | [wpanayides](https://sketchfab.com/mcpanayides) | CC BY 4.0 |

This work is based on "Server Racking System" (https://sketchfab.com/3d-models/server-racking-system-6fe2cacf836b4aed96c650b286db5486) by wpanayides (https://sketchfab.com/mcpanayides) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).

As texturas da sala e do núcleo de IA não vêm de arquivos: são geradas no código (`<canvas>`), então não têm licença de terceiros.

## Divisão de tarefas

| Entrega | Letícia | Kevin |
| --- | --- | --- |
| M1: estrutura e modelos | Vite/Three.js, câmera em primeira pessoa e lil-gui | sala, racks, robôs e carregamento dos modelos |
| M2: iluminação | sombras e SpotLights | iluminação do núcleo de IA e materiais emissivos |
| M3: materiais e efeitos | materiais do ambiente e do núcleo de IA | tubos de resfriamento, materiais dos modelos e animações |
| M4: finalização | README e integração do projeto | vídeo e ajustes finais |

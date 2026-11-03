## Justificativa: iluminação do núcleo de IA

Por que um PointLight além do material emissivo. No Three.js, um material emissivo só faz o próprio objeto parecer aceso. Ele não emite luz para os vizinhos, porque não há iluminação global. Se o núcleo tivesse só o emissive, ele brilharia, mas os racks e o chão ao redor continuariam sem receber nada. O PointLight na posição da esfera é o que realmente ilumina a cena, e é ele que dá a impressão de que o núcleo é a fonte de luz da sala.

Parâmetros da luz. Usamos decay = 2, que é a atenuação físicamente correta (queda com o inverso do quadrado da distância), com intensidade em candelas e distance = 14 para limitar o alcance. Assim a luz azulada alcança os racks próximos e se apaga antes das paredes distantes. Com decay baixo a luz ficaria chapada e sem profundidade.

Pulsação sincronizada. O mesmo fator k = 1 + pulse·sin(t·speed) multiplica a intensidade da luz e a do material emissivo. Se só um deles pulsasse, a esfera pareceria desligada da luz que ela emite. A animação usa elapsed e delta do timer, então a velocidade é a mesma em qualquer taxa de quadros.

Sem sombra no núcleo. castShadow = false é uma decisão de desempenho: sombra de PointLight exige renderizar a cena em 6 direções (cubemap) a cada quadro, e a cena já tem muitas malhas. As sombras ficam por conta das SpotLights, que custam uma passada cada.

Pedestal escuro e não emissivo. O contraste com a esfera brilhante reforça a percepção de luminosidade, e ele recebe a luz do núcleo e projeta sombra.

## Justificativa: materiais emissivos

emissiveMap igual à textura difusa. Em vez de pintar o modelo inteiro com uma cor emissiva, reaproveitamos a textura existente como mapa de emissão. As partes escuras permanecem escuras e só as claras (LEDs e telas) acendem, sem criar texturas novas. A cor emissiva fica em branco (0xffffff) para não tingir o mapa.

Aplicado antes de clonar. Os clones compartilham os materiais do original, então uma única chamada acende todas as unidades, e o slider do gui controla todas ao mesmo tempo.

Intensidades diferentes. LEDs com 0.35 e tela do console com 1.0: LEDs de servidor são pequenos e numerosos, e uma intensidade alta transformaria o rack em uma mancha branca. A tela é uma superfície maior e precisa se destacar.

Tone mapping ACES. Valores emissivos acima de 1 saturam em branco no pipeline linear padrão. O ACESFilmicToneMapping comprime as altas luzes e preserva a cor (o ciano continua ciano em vez de virar branco), e o toneMappingExposure fica ajustável no gui para calibrar o conjunto.

Luz base com HemisphereLight. O emissivo e o núcleo precisam de uma cena escura para se destacar, mas totalmente preta ficaria ilegível. O preenchimento fraco, sem sombra e sem custo relevante, mantém a sala visível até as SpotLights entrarem.

## Justificativa: SpotLights do teto e sombras

Por que SpotLight. As luminárias são três SpotLights embutidas no teto, em fila sobre o corredor central (x = -4,2, 0 e 4,2), apontando para o chão. Uma DirectionalLight imita o sol, com raios paralelos que iluminam a sala inteira por igual, o que não faz sentido dentro de uma sala fechada e apagaria o clima escuro de que o núcleo e os LEDs precisam. Uma PointLight ilumina para todos os lados e, com sombra, renderiza a cena seis vezes por quadro. A SpotLight tem cone, cai com a distância e a sombra dela custa uma única passada por luz.

Cor e intensidade. Branco frio (#d6ecff), para combinar com o azul do núcleo sem tingir a sala. A intensidade é de 160 candelas com decay = 2 (queda física com o inverso do quadrado da distância). A 4,85 m do chão isso ilumina o corredor e deixa as laterais e as paredes na penumbra, o contraste que valoriza os elementos emissivos.

Cone. Ângulo de 38° e penumbra de 0,45. O ângulo cobre a largura do corredor e o topo dos servidores sem invadir as paredes. A penumbra esfumaça a borda do cone, como numa luminária real; com penumbra 0 aparece um círculo de borda dura no chão.

Painel emissivo. Cada luz tem um disco emissivo no teto. Ele não ilumina nada (o emissivo só acende o próprio objeto); serve para a luz ter uma fonte visível. O painel não projeta sombra, senão taparia o próprio cone.

Shadow map. PCFShadowMap com shadow.radius = 4: o filtro PCF compara a profundidade em vários pontos ao redor e suaviza a borda da sombra. No Three.js r186 o PCFSoftShadowMap foi removido, e o PCF com radius faz esse papel. Resolução de 1024 × 1024: com 512 a borda das sombras dos robôs e dos racks fica serrilhada; com 2048 a memória quadruplica sem diferença visível na altura dos olhos.

Câmera de sombra. near = 0,5 e far = 7. A luz está a ~4,85 m do chão e, na borda do cone, a distância até o chão é 4,85 / cos(38°) ≈ 6,2 m. Um intervalo near–far justo dá mais precisão de profundidade por metro e menos artefatos, o mesmo raciocínio usado no near/far da câmera principal. O fov dessa câmera é calculado pelo próprio Three.js a partir do ângulo da luz.

Bias. bias = -0,0005 e normalBias = 0,02. Sem bias aparece shadow acne (listras de sombra na própria superfície, porque ela "sombreia a si mesma" por erro de precisão). Com bias exagerado, a sombra descola da base do objeto (peter-panning). O normalBias desloca a comparação ao longo da normal e resolve a acne nas laterais dos racks, que ficam inclinadas em relação à luz, com menos descolamento. Os dois valores podem ser testados ao vivo no painel.

Custo medido. Com a câmera no meio do corredor olhando para os robôs, sem sombras a cena gasta 389 draw calls; com as três SpotLights projetando sombra, 1.327, porque cada malha dentro do cone é desenhada de novo no shadow map de cada luz. Esse custo é o motivo de a PointLight do núcleo não projetar sombra e de o modelo glTF de 459 malhas, ao lado do núcleo, não projetar sombra e receber só uma luz de destaque sem sombra. A viewport de cima do modo diagnóstico reaproveita os shadow maps do quadro (shadowMap.autoUpdate desligado só durante ela), para não recalculá-los duas vezes.

Quem projeta e quem recebe. Os modelos carregados (racks, servidores, robôs) e o pedestal do núcleo projetam e recebem sombra. O piso e as paredes só recebem. A esfera e os anéis do núcleo não projetam, porque são a própria fonte de luz da cena.
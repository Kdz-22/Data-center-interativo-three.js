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
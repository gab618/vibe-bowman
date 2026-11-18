Quero criar um jogo de navegador 2D inspirado no clássico *Bowman* (era Flash 2006), focado em duelos de arco e flecha com bonecos stickman, estética minimalista e física satisfatória, utilizando meus próprios assets em **SVG** para a identidade visual.

### Stack & Estrutura
- Crie o projeto usando **Vite + TypeScript** puro (sem engines pesadas, usando **HTML5 Canvas** nativo).
- Separe claramente física/lógica de renderização (`src/game/physics.ts`, `src/game/rig.ts`, `src/game/renderer.ts`, `src/game/audio.ts`, `src/game/assetLoader.ts`).
- Os sons devem ser sintetizados via **Web Audio API**.

### Pipeline de Assets SVG (`public/assets/`)
Eu mesmo vou desenhar e fornecer os arquivos SVG na pasta `public/assets/`. O código deve pré-carregar esses SVGs como `HTMLImageElement` antes de iniciar o jogo (com fallback geométrico simples caso algum arquivo ainda não exista na pasta, para eu conseguir rodar o projeto imediatamente enquanto desenho):
- `head.svg` (ancorado na base/pescoço)
- `torso.svg` (ancorado entre ombros e quadril)
- `arm.svg` e `leg.svg` (segmentos articulados para braços/antebraços e coxas/canelas)
- `bow.svg` (ancorado na empunhadura central; desenhe a corda dinamicamente via Canvas conectando as extremidades do arco até a mão que puxa a flecha)
- `arrow.svg` (desenhada horizontalmente apontando para a direita `0°`, com a origem/pivô na ponta da flecha para precisão de impacto)

Crie um arquivo de configuração centralizado (`src/game/rigConfig.ts`) onde eu possa ajustar facilmente a escala e os offsets `(x, y)` de cada pivô/articulação dos SVGs sem precisar caçar números mágicos no código de renderização.

### Modo "Visual Sandbox" (Inspeção de Arte)
- Adicione um atalho de teclado (ex: tecla `V`) que alterna para uma tela de **Inspeção Visual** isolada.
- Nessa tela, exiba o stickman montado com meus SVGs em diferentes estados (parado, mirando em 45° com força máxima, atingido e ragdoll), além da flecha e partículas, permitindo testar proporções, encaixes das articulações e paleta de cores rapidamente.

### Mecânicas Principais (Core Loop)
1. **Cenário e Câmera:**
   - Terreno 2D gerado proceduralmente com colinas e vales suaves a cada partida.
   - Dois arqueiros em lados opostos a uma distância aleatória (30m a 80m).
   - Câmera dinâmica com zoom/pan suave acompanhando a mira, seguindo a flecha em voo e retornando ao próximo jogador após o impacto.
   - Indicador na tela de distância entre os jogadores e direção/intensidade do vento.

2. **Mira, Disparo e Física:**
   - Clique e arraste em qualquer lugar da tela para definir ângulo e potência com um indicador vetorial minimalista perto do arqueiro (sem mostrar a parábola completa).
   - O tronco, cabeça, braços e o `bow.svg` devem rotacionar acompanhando o ângulo da mira, enquanto a corda se estica proporcionalmente à força.
   - Trajetória balística afetada por gravidade e vento, rotacionando a `arrow.svg` conforme seu vetor de velocidade.
   - **Hitboxes segmentadas:** Cabeça (headshot = dano crítico / morte instantânea), Tronco (dano médio) e Pernas/Braços (dano baixo).
   - **Persistência da flecha:** Quando a flecha atinge o chão ou o stickman, ela permanece fincada exatamente no ponto e ângulo do impacto, acompanhando o movimento/queda do boneco.
   - Ao zerar o HP, o perdedor entra em física *ragdoll* simples ou tomba dramaticamente.

### Estética & Áudio
- **Visual:** Fundo limpo off-white/papel (`#F4EFE6`) com textura sutil procedural, terreno em carvão escuro (`#1A1A1D`), partículas de impacto (respingos vermelhos e poeira) e avisos rápidos na tela ("HEADSHOT!", "ACERTO A 54m!").
- **Áudio (Web Audio API):** Efeitos sintetizados para tensão da corda, *whoosh* da flecha, impacto na terra e impacto crítico.

### Plano de Execução
Antes de gerar o código, me apresente:
1. A estrutura de arquivos proposta e como funcionará o sistema de pivôs/ancoragem dos SVGs (`rigConfig.ts`).
2. Um resumo da física balística, hitboxes e câmera.
Assim que eu aprovar, implementamos a base jogável com fallbacks para eu já começar a plugar meus SVGs.


# Bowman: especificação da v1

Jogo de navegador 2D inspirado no clássico *Bowman* (Flash, 2006): duelos por turnos de arco e flecha entre bonecos stickman, estética minimalista, física satisfatória e arte própria em **SVG**.

> **Para o modelo implementador:** este documento é a fonte da verdade. As decisões aqui já foram aprovadas, então não pare para pedir aprovação. Implemente seguindo os **Marcos de entrega** (seção 12), na ordem. Ao fim de cada marco, `npm run build` e `npm test` devem passar sem erros. Se encontrar uma ambiguidade real, escolha a opção mais simples e registre-a em `DECISIONS.md`.

---

## 1. Escopo da v1

**Dentro:**
- 2 jogadores no mesmo computador (hotseat), por turnos.
- Menu, pause e fim de jogo.
- Terreno procedural.
- Balística sem vento.
- Hitboxes por zona.
- Flechas persistentes.
- Ragdoll.
- Partículas, áudio sintetizado e Visual Sandbox.

**Fora (futuro, mas a arquitetura deve permitir):**
- Modo contra CPU com IA.
- Vento.
- Mecânica de dano avançada.
- Mobile como foco (Pointer Events já cobrem o toque, mas não é requisito testado).

## 2. Stack e convenções

- **Vite + TypeScript** (`strict: true`) e **HTML5 Canvas 2D** nativo. Sem engines nem bibliotecas de física.
- **Vitest** para testes unitários da lógica pura (física, colisão, IK, terreno, dano, tokens de cor).
- **Web Audio API** para todos os sons (sintetizados, sem arquivos de áudio).
- **Idioma da UI:** português (pt-BR). Código e identificadores em inglês.
- **Separação estrita:** lógica e física não importam nada de renderização. O renderer só lê o estado.
- **Sem números mágicos:** todo valor ajustável fica em `src/game/config/*`.

## 3. Estrutura de arquivos

```
index.html
src/
  main.ts                   # bootstrap: canvas, resize/DPR, game loop com timestep fixo
  game/
    config/
      physicsConfig.ts      # gravidade, velocidades, escala, timestep, terreno, câmera
      rigConfig.ts          # esqueleto (metros) + contrato dos SVGs (anchor/tip, z-order)
      paletteConfig.ts      # cores-token e paletas (jogador azul / preto / cenário)
      damageConfig.ts       # HP e dano por zona
    state.ts                # máquina de estados (Menu, Playing, Paused, GameOver, Sandbox)
    match.ts                # partida: jogadores, turnos, flechas, resolução de dano
    controller.ts           # interface Controller + HumanController (AIController no futuro)
    input.ts                # Pointer Events → intenção de mira; teclado
    physics.ts              # integração balística + colisão contínua
    terrain.ts              # heightmap procedural, alturas e normais
    rig.ts                  # esqueleto, pose de mira, IK de 2 ossos, hitboxes
    ragdoll.ts              # ragdoll Verlet
    camera.ts               # pan/zoom suave, conversões mundo↔tela
    particles.ts            # sangue e poeira
    assetLoader.ts          # fetch SVG → troca de tokens → HTMLImageElement; fallbacks
    renderer.ts             # desenho do mundo (fundo, terreno, bonecos, flechas, partículas)
    hud.ts                  # HP, turno, distância, avisos ("HEADSHOT!"), indicador fora da tela
    ui.ts                   # menu, pause, fim de jogo (DOM sobreposto ao canvas)
    audio.ts                # síntese dos efeitos
    sandbox.ts              # Visual Sandbox
  tests/                    # *.test.ts (Vitest)
public/assets/              # SVGs do artista (podem não existir → fallback)
asset-templates/            # SVGs-modelo com tokens e pontos corretos, para o artista copiar
DECISIONS.md                # decisões tomadas durante a implementação
```

## 4. Regras e fluxo de jogo

### Estados
```
Menu ──[Iniciar partida]──▶ Playing ──(alguém morre)──▶ GameOver
                              │  ▲                         │
                         Esc/P│  │Continuar      [Jogar novamente] → Playing (novo terreno)
                              ▼  │                    [Menu] → Menu
                            Paused ──[Reiniciar partida]──▶ Playing (novo terreno)
                              └────[Sair para o menu]──▶ Menu
Qualquer estado ──[V]──▶ Sandbox ──[V/Esc]──▶ estado anterior (a partida fica pausada)
```

### Menu e telas
- **Menu:** título "BOWMAN" e um botão **Iniciar partida**. O clique também destrava o `AudioContext`.
- **Pause:** botão ⏸ visível no canto superior direito durante a partida, mais as teclas `Esc` e `P`. O menu de pause tem **Continuar**, **Reiniciar partida** e **Sair para o menu**. A física e a câmera congelam.
- **Fim de jogo:** "JOGADOR AZUL VENCEU!" (ou PRETO), com os botões **Jogar novamente** e **Menu**. A tela aparece cerca de 2 s após a morte, para o ragdoll ser visto.
- **Áudio:** a tecla `M` liga/desliga o som.

### Turnos
- Jogador **Azul** à esquerda e **Preto** à direita. O Azul sempre começa. Os turnos alternam.
- Um disparo por turno.
- O turno termina quando a flecha crava no terreno, crava num boneco ou sai do mundo (aviso "ERROU!").
- Depois disso: a câmera segura 1 s no impacto e então transiciona até o próximo jogador.
- Não é possível mirar durante o voo ou a transição.
- Toda origem de mira passa por `Controller` (`HumanController` na v1), para o `AIController` futuro entrar sem refatoração.

### Dano (`damageConfig.ts`)
| Zona | Dano v1 |
|---|---|
| head | 100 (morte instantânea) |
| torso | 34 |
| arm | 34 |
| leg | 34 |

- HP inicial: 100. HP ≤ 0 → morte → ragdoll.
- **Auto-acerto vale:** a flecha pode atingir o próprio atirador.
- As zonas ficam separadas no código, para o dano evoluir depois (tabela → função que recebe zona, velocidade e osso).
- **Avisos na tela:** "HEADSHOT!", "ACERTO A 54m!" (distância horizontal entre os arqueiros), "ERROU!".

## 5. Física (`physicsConfig.ts`)

Toda a física roda em **metros e segundos**. Pixels só existem na câmera e no renderer.

| Parâmetro | Valor |
|---|---|
| Unidade | 1 unidade de mundo = 1 m |
| Escala base | 1 m = 40 px de tela no zoom 1.0 |
| Gravidade | 12 m/s² |
| Velocidade da flecha | `lerp(6, 40, força)` m/s |
| Vento | 0 (o campo `wind` existe no modelo, mas fica desligado na v1) |
| Arrasto do ar | nenhum |
| Timestep | fixo, 1/120 s, com acumulador (máx. 5 passos por frame) |
| Comprimento da flecha | 0,8 m (a colisão usa a ponta) |

- **Integração:** semi-implícita (Euler simplético) basta.
- **Rotação da flecha:** sempre `atan2(vy, vx)`.
- **Colisão contínua:** a cada passo, testar o segmento `pontaAnterior → pontaAtual`:
  1. Contra as hitboxes dos dois bonecos (interseção segmento × círculo e segmento × cápsula).
  2. Contra o heightmap.
  3. Fica valendo o primeiro impacto ao longo do segmento.
- **Flecha cravada:**
  - Para no ponto exato do impacto, mantendo o ângulo de chegada.
  - Penetra 0,15 m: a ponta avança na direção do voo e fica escondida.
  - **No terreno:** fica em coordenadas de mundo.
  - **Num boneco:** guarda `{boneId, posiçãoLocal, ânguloLocal}` e acompanha o osso no recuo e no ragdoll.
  - Máximo de 50 flechas persistentes; as mais antigas são removidas primeiro.
  - Flechas não colidem com outras flechas.
- **Limites do mundo:** a flecha que passa das bordas laterais ou cai abaixo do terreno encerra o turno como "ERROU!".

### Terreno (`terrain.ts`)
- **Distância horizontal entre os arqueiros:** aleatória entre 30 e 80 m.
- **Largura do mundo:** distância + 25 m de margem de cada lado.
- **Heightmap:** amostras a cada 0,5 m. Altura = soma de 3 senoides com frequências e fases aleatórias, suavizada.
- **Limites do relevo:**
  - Variação total de ±6 m.
  - Plataforma plana de 3 m sob cada arqueiro, com transição suave.
  - Nenhum ponto entre os arqueiros pode ficar mais de 8 m acima do mais baixo. Se ficar, gere de novo ou achate o trecho.
- **API:** `heightAt(x)`, `normalAt(x)` e `intersectSegment(a, b)`.
- **Visual:** silhueta preenchida em `#1A1A1D`.
- **Aleatoriedade:** o gerador aceita uma `seed` (útil para testes e para depurar).

### Mira (`input.ts`)
- **Puxar para trás (estilingue):**
  - O jogador pressiona em qualquer ponto da tela e arrasta.
  - Direção do disparo = vetor **oposto** ao arrasto.
  - Força = `clamp(distânciaArrastoEmPxDeTela / 200, 0, 1)`, independente do zoom.
- Soltar com força < 0,05 cancela o tiro.
- **Arqueiro da direita:** o ângulo é livre (pode atirar para trás). A pose espelha conforme o lado para onde mira.
- **Indicador vetorial minimalista** junto ao arqueiro: uma linha/seta cujo comprimento reflete a força, mais o texto "47° · 82%". A parábola não é mostrada.
- **Fantasma** (linha tênue) com o ângulo e a força do último tiro do mesmo jogador.
- Pointer Events, com `setPointerCapture`.

### Câmera (`camera.ts`)
- **Mirando:** centraliza no arqueiro ativo, com deslocamento suave na direção da mira (até 25% da tela).
- **Indicador de borda:** quando o oponente está fora da tela, aparece uma seta na borda apontando para ele, com a distância.
- **Em voo:** segue a flecha com suavização exponencial. O zoom recua conforme a velocidade e a altura.
- **Após o impacto:** segura 1 s e então transiciona em cerca de 1 s até o próximo arqueiro.
- Zoom entre 0.5 e 1.5.
- Suporte a `devicePixelRatio` e a redimensionamento da janela.

## 6. Rig do boneco (`rig.ts` + `rigConfig.ts`)

### Esqueleto (metros, boneco virado para a direita, +y para cima no mundo)

- **Altura total:** ≈ 1,8 m. O **pelvis** é a raiz, 0,95 m acima do chão.
- **Ossos (11):**

| Osso | Origem | Comprimento | Observação |
|---|---|---|---|
| `torso` | pelvis → neck | 0,55 m | |
| `head` | neck | — | círculo de raio 0,13 m, centro 0,16 m acima do neck |
| `upperArmFront` → `forearmFront` | neck (ombro) | 0,30 m + 0,28 m | braço que segura o arco; a mão fica no fim do antebraço |
| `upperArmBack` → `forearmBack` | neck (ombro) | 0,30 m + 0,28 m | braço que puxa a corda |
| `thighFront` → `shinFront` | pelvis | 0,45 m + 0,45 m | o pé fica no fim da canela |
| `thighBack` → `shinBack` | pelvis | 0,45 m + 0,45 m | |

### Pose procedural (sem animações pré-desenhadas)

- **Parado:** torso reto, braços relaxados com o arco baixo, pés afastados 0,35 m.
- **Mirando** (ângulo θ, força f):
  - **Torso:** inclina `0,2·θ` (limite de ±15°).
  - **Cabeça:** inclina `0,5·θ` (limite de ±35°).
  - **Braço da frente:** IK de 2 ossos até a empunhadura, que fica a 0,55 m do ombro na direção θ (cotovelo quase esticado).
  - **Braço de trás:** IK de 2 ossos até a mão da corda, em `empunhadura − dir(θ)·(0,15 + 0,45·f)`. O cotovelo dobra para trás e para cima.
  - **Arco:** rotacionado em θ, centrado na empunhadura.
  - **Corda:** desenhada no Canvas, das pontas do arco até a mão de trás. Em repouso, é uma reta entre as pontas.
  - **Flecha encaixada:** desenhada sobre o arco, com a cauda na mão de trás.
- **Atingido** (sem morrer): recuo de 250 ms. O torso inclina para trás, afastando-se do impacto, e volta com easing.
- **Morto:** ragdoll (ver abaixo).
- **Espelhamento:** o jogador da direita (e qualquer pose mirando para a esquerda) é desenhado com `scale(-1, 1)` em torno do pelvis.
- Na v1 as pernas não se adaptam ao relevo (as plataformas são planas).

### Hitboxes (derivadas da pose atual, inclusive no ragdoll)
| Zona | Forma | Raio |
|---|---|---|
| head | círculo | 0,13 m |
| torso | cápsula (pelvis → neck) | 0,12 m |
| arm | cápsula por osso (4) | 0,06 m |
| leg | cápsula por osso (4) | 0,07 m |

### Ragdoll (`ragdoll.ts`, Verlet)
- **Partículas:** head, neck, pelvis, 2 cotovelos, 2 mãos, 2 joelhos, 2 pés.
- **Restrições:** distância de cada osso, mais diagonais de rigidez (neck–joelhos, pelvis–head). São 4 a 6 iterações por passo.
- Colisão com o heightmap, com atrito.
- **Inicialização:** os pontos partem da pose atual. A partícula mais próxima do impacto recebe um impulso na direção e proporcional à velocidade da flecha.
- **Arco:** cai junto com a mão da frente (fica preso a ela).

## 7. Pipeline de arte: SVG com cores-token

### Arquivos esperados (`public/assets/`)

| Arquivo | Peça | Pontos obrigatórios (coordenadas do **viewBox**) |
|---|---|---|
| `head.svg` | cabeça | `anchor` = base do pescoço, `tip` = topo da cabeça |
| `torso.svg` | tronco | `anchor` = quadril, `tip` = pescoço |
| `upper-arm.svg` | braço (ombro→cotovelo) | `anchor` = ombro, `tip` = cotovelo |
| `forearm.svg` | antebraço + mão | `anchor` = cotovelo, `tip` = mão |
| `thigh.svg` | coxa | `anchor` = quadril, `tip` = joelho |
| `shin.svg` | canela + pé | `anchor` = joelho, `tip` = tornozelo/pé |
| `bow.svg` | arco | `grip` = empunhadura, `stringTop` e `stringBottom` = pontas onde a corda se prende |
| `arrow.svg` | flecha (horizontal, apontando para a direita, 0°) | `tip` = ponta, `tail` = cauda |

### Contrato de encaixe (`rigConfig.ts`)
- Cada peça declara seus pontos em coordenadas do viewBox do próprio SVG. Exemplo:
  ```ts
  forearm: { src: 'forearm.svg', anchor: { x: 4, y: 12 }, tip: { x: 150, y: 12 } }
  ```
- O renderer calcula **escala e rotação automaticamente**, para que o segmento `anchor → tip` coincida com o osso (comprimento em metros → pixels via câmera). O artista nunca ajusta escala "na mão".
- Ajustes finos opcionais por peça: `rotationOffset` (graus), `lengthScale` (padrão 1) e `widthScale` (padrão 1).
- **Arco:** `length` em metros (padrão 1,2 m entre `stringTop` e `stringBottom`).
- **Flecha:** a distância `tip → tail` vale 0,8 m.
- **Z-order** configurável. Padrão: perna de trás → braço de trás → torso → cabeça → perna da frente → arco → flecha encaixada → braço da frente.
- **Regra de desenho para o artista:**
  - Boneco sempre virado para a **direita**.
  - Membros desenhados **na horizontal**: junta de origem à esquerda, junta de destino à direita.
  - O tronco e a cabeça podem ser desenhados na vertical. Os pontos `anchor`/`tip` definem a orientação.

### Cores-token (`paletteConfig.ts`)
O artista pinta os SVGs usando **apenas estas cores-chave** (hex de 6 dígitos) nas partes que mudam de cor. Qualquer outra cor do SVG é preservada como está.

| Token (no SVG) | Significado | Azul (P1) | Preto (P2) |
|---|---|---|---|
| `#FF00FF` | corpo, cor principal | `#2F5DA8` | `#1F1F24` |
| `#00FFFF` | corpo, detalhe/sombra | `#1E3F78` | `#3A3A42` |
| `#FFFF00` | madeira do arco | `#6B4A2B` | `#6B4A2B` |
| `#00FF00` | penas da flecha | `#2F5DA8` | `#1F1F24` |
| `#FF8000` | haste da flecha | `#3B2F25` | `#3B2F25` |

> [!NOTE]
> O preto do P2 (`#1F1F24`) fica próximo do terreno (`#1A1A1D`). Isso é aceitável porque o boneco aparece majoritariamente contra o fundo claro. Se os pés "sumirem" no chão, ajuste em `paletteConfig.ts`.

**Penas da flecha na cor do dono:** as flechas cravadas mostram quem atirou.

### Carregamento (`assetLoader.ts`)
1. `fetch` do texto de cada SVG. Um 404 ou erro aciona o **fallback** daquela peça, sem quebrar o jogo.
2. **Substituição dos tokens**, sem diferenciar maiúsculas de minúsculas, em `fill`, `stroke`, `stop-color` e `style`, gerando **uma variante por paleta** (azul e preto). Bow e arrow também geram variantes.
3. **Garantia de tamanho:** se faltar `width`/`height` no `<svg>`, eles são derivados do `viewBox`. Para nitidez com zoom, a imagem é criada com tamanho intrínseco = viewBox × `assetRasterScale` (padrão 4). O renderer converte os pontos do viewBox considerando esse fator.
4. Cria um Blob URL, depois um `HTMLImageElement` com `await img.decode()`, e guarda em cache por `(peça, paleta)`.
5. **Fallback geométrico:** cada peça ausente vira uma forma simples nas mesmas dimensões do osso:
   - Membros e tronco: cápsula preenchida com a cor principal da paleta.
   - Cabeça: círculo.
   - Arco: arco de círculo.
   - Flecha: linha com triângulo na ponta.
6. `reloadAssets()` limpa o cache e recarrega (usado pelo Sandbox).

### Modelos para o artista (`asset-templates/`)
- Gerar um SVG-modelo para cada peça: formas simples, já usando os tokens, com `width`/`height`/`viewBox` definidos e com os pontos `anchor`/`tip` marcados por círculos de referência e comentados.
- Os valores correspondentes já ficam preenchidos no `rigConfig.ts`.
- Esses arquivos **não** ficam em `public/assets/`. Assim o fallback continua sendo exercitado até o artista copiar os seus.

## 8. Visual Sandbox (`sandbox.ts`, tecla `V`)

Tela isolada para inspecionar a arte. Fica disponível em todos os builds na v1.

- **Bonecos lado a lado** (paleta azul e preta) em 4 estados: parado, mirando a 45° com força máxima, atingido (recuo em loop) e ragdoll (reinicia a cada 3 s).
- **Também exibe:** flecha isolada, flecha cravada num boneco e um emissor de partículas (sangue e poeira).
- **Painel lateral (DOM):**
  - Seletor de peça.
  - Sliders para `anchor`/`tip` (x, y), `rotationOffset`, `lengthScale` e `widthScale`, com efeito ao vivo.
  - Color pickers para os tokens de cada paleta.
  - Botão **Copiar config**, que copia para a área de transferência o trecho TS/JSON atualizado do `rigConfig`/`paletteConfig`.
- **Atalhos:**
  - `D`: alterna o overlay de debug (ossos, juntas, pontos anchor/tip e hitboxes).
  - `R`: recarrega os assets.
  - Slider de zoom.
  - Controles de ângulo e força para a pose de mira.

## 9. Estética

- **Fundo:**
  - Papel off-white `#F4EFE6`, com textura procedural sutil (ruído e fibras de baixa opacidade).
  - A textura é gerada **uma vez** num canvas offscreen e repetida.
  - Leve parallax de 0,2 em relação à câmera.
- **Terreno:** `#1A1A1D`.
- **Partículas:**
  - Respingos vermelhos (`#B3261E`) com gravidade, nos acertos em bonecos.
  - Poeira cinza-carvão nos impactos no terreno.
  - Vida de 0,4 a 1,2 s.
  - Na v1 as partículas não colidem com o chão: apenas somem.
- **HUD:**
  - Barras de HP nos cantos superiores, com o nome e a cor de cada jogador.
  - Indicador de turno ("Vez do AZUL").
  - Distância entre os jogadores no topo central.
  - Avisos grandes e centrais, com animação curta de escala e fade (~1,2 s).
  - Tipografia sans-serif limpa.

## 10. Áudio (`audio.ts`, Web Audio API)

- **Tensão da corda:**
  - Som contínuo enquanto o jogador mira: ruído filtrado mais um oscilador grave.
  - O pitch e o volume sobem com a força.
  - Para ao soltar ou cancelar.
- **Disparo:** "twang" (oscilador com envelope de decaimento rápido).
- **Whoosh:** ruído passando por filtro passa-banda, com frequência e volume modulados pela velocidade da flecha. Toca durante o voo.
- **Impacto na terra:** thump grave curto com um pouco de ruído.
- **Impacto no corpo:** thump abafado.
- **Impacto crítico (headshot):** o thump mais um acento agudo.
- **Desbloqueio:** o `AudioContext` é criado ou retomado no clique de **Iniciar partida**.
- **Controles:** `M` liga/desliga o som. Volume master no config.

## 11. Testes (Vitest)

Cobrir, no mínimo:
- **Balística:** com 45° e v = 31 m/s em g = 12, o alcance em terreno plano fica em ≈ 80 m (tolerância de 2%).
- **Colisão contínua:** uma flecha a 40 m/s não atravessa uma cápsula de 0,06 m. Testar interseção segmento × círculo e segmento × cápsula.
- **Terreno:** os limites de altura são respeitados para várias seeds; as plataformas são planas.
- **IK de 2 ossos:** a mão alcança o alvo quando ele está ao alcance; quando não está, o braço estica sem gerar NaN.
- **Dano:** headshot mata; três acertos de 34 matam; dois não.
- **Tokens:** a substituição troca só os tokens e injeta `width`/`height` quando faltam.

## 12. Marcos de entrega

Cada marco termina com `npm run build` e `npm test` passando e com o jogo rodando via `npm run dev`.

1. **M1: Fundação**
   - Projeto Vite + TS + Vitest.
   - Loop com timestep fixo, canvas com DPR e resize.
   - Configs criados.
   - Terreno procedural e câmera básica.
   - Dois bonecos parados, desenhados só com fallbacks.
   - Fundo de papel.
2. **M2: Disparo**
   - Input de mira (puxar para trás), indicador vetorial e fantasma.
   - Pose de mira com IK, arco e corda.
   - Balística, colisão contínua com o terreno, flecha cravada no chão.
   - Câmera seguindo a flecha e transição de turno.
3. **M3: Combate**
   - Hitboxes por zona e flecha cravada no osso.
   - Dano, HP e recuo.
   - HUD e avisos.
   - Fluxo completo: Menu → Playing → Paused (com as 3 opções) → GameOver.
4. **M4: Arte e juice**
   - `assetLoader` com cores-token, variantes azul/preta e fallbacks.
   - `asset-templates/`.
   - Ragdoll Verlet.
   - Partículas.
   - Áudio completo.
5. **M5: Visual Sandbox**
   - Estados, painel de ajuste ao vivo, color pickers, copiar config, overlay de debug e recarga de assets.
   - Escrever um `README.md` com instruções para o artista (como desenhar, os tokens e como ajustar no Sandbox).

## 13. Evoluções futuras (não implementar agora; só não bloquear)

- **Modo contra CPU:** `AIController` simula disparos com a mesma `physics.ts` (busca por ângulo e força), com erro proposital que diminui a cada turno.
- **Vento:** aceleração horizontal sorteada por turno, mais um indicador no HUD.
- **Dano avançado:** escalar pela velocidade, sangramento, membros incapacitados.
- **Pernas adaptadas ao relevo** (IK nos pés).

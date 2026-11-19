# vibe-bowman

Jogo de navegador 2D inspirado no clássico *Bowman* (2006), feito com **Vite + TypeScript + HTML5 Canvas 2D + Web Audio API**.

## Rodando o projeto

```bash
npm install
npm run dev      # inicia o servidor de desenvolvimento
npm test         # roda os testes unitários (Vitest)
npm run build    # valida TypeScript e gera build de produção
```

### Controles
- **Mirar e atirar:** clique e arraste para trás (estilingue) em qualquer lugar da tela e solte.
- **`Esc` / `P`:** pausar ou retomar a partida.
- **`M`:** ligar/desligar o áudio.
- **`V`:** abrir/fechar o **Visual Sandbox** de inspeção de arte.

---

## Guia para o Artista (Pipeline de Assets SVG)

Se os arquivos ainda não existirem em `public/assets/`, o jogo roda normalmente usando formas geométricas de fallback. Assim que você colocar um SVG em `public/assets/`, ele passa a ser usado automaticamente.

Os modelos prontos para copiar e desenhar por cima ficam na pasta `asset-templates/`.

### 1. Arquivos esperados em `public/assets/`

| Arquivo | Peça | Orientação ao desenhar | Pontos no `viewBox` (`rigConfig.ts`) |
|---|---|---|---|
| `head.svg` | Cabeça | Vertical (olhando para a direita) | `anchor` = base do pescoço, `tip` = topo da cabeça |
| `torso.svg` | Tronco | Vertical (frente para a direita) | `anchor` = quadril, `tip` = pescoço |
| `upper-arm.svg` | Braço | **Horizontal** (ombro à esq. → cotovelo à dir.) | `anchor` = ombro, `tip` = cotovelo |
| `forearm.svg` | Antebraço + mão | **Horizontal** (cotovelo à esq. → mão à dir.) | `anchor` = cotovelo, `tip` = mão |
| `thigh.svg` | Coxa | **Horizontal** (quadril à esq. → joelho à dir.) | `anchor` = quadril, `tip` = joelho |
| `shin.svg` | Canela + pé | **Horizontal** (joelho à esq. → pé à dir.) | `anchor` = joelho, `tip` = tornozelo/pé |
| `bow.svg` | Arco | Vertical (barriga do arco à direita) | `grip` = empunhadura, `stringTop` e `stringBottom` = pontas da corda |
| `arrow.svg` | Flecha | **Horizontal** (0°, ponta à direita) | `tail` = cauda, `tip` = ponta |

> **Dica:** desenhe sempre o boneco virado para a **direita**. O jogo espelha automaticamente o jogador da direita (e quando qualquer jogador mira para a esquerda).

> **Importante:** mantenha `viewBox` (e preferencialmente `width`/`height`) definidos na tag `<svg>`. O carregador injeta `width`/`height` a partir do `viewBox` se faltarem e rasteriza em 4× para manter nitidez no zoom.

### 2. Cores-Token

Pinte as partes que mudam por jogador usando **exatamente** estas cores hexadecimais (não diferencia maiúsculas de minúsculas). Qualquer outra cor no seu SVG será mantida intacta.

| Token no SVG | Significado | Azul (P1) | Preto (P2) |
|---|---|---|---|
| `#FF00FF` | Corpo, cor principal | `#2F5DA8` | `#1F1F24` |
| `#00FFFF` | Corpo, detalhe/sombra | `#1E3F78` | `#3A3A42` |
| `#FFFF00` | Madeira do arco | `#6B4A2B` | `#6B4A2B` |
| `#00FF00` | Penas da flecha | `#2F5DA8` | `#1F1F24` |
| `#FF8000` | Haste da flecha | `#3B2F25` | `#3B2F25` |

As paletas finais ficam em `src/game/config/paletteConfig.ts`.

### 3. Como ajustar encaixes no Visual Sandbox (`V`)

1. Coloque seus arquivos `.svg` na pasta `public/assets/`.
2. Abra o jogo (`npm run dev`) e pressione **`V`** para entrar no **Visual Sandbox**.
3. Pressione **`D`** para exibir os ossos, pontos `anchor`/`tip` e hitboxes por cima da arte.
4. No painel à direita:
   - Selecione a peça e ajuste `anchor`, `tip`, `rotOffset°`, `lengthScale` e `widthScale` em tempo real.
   - Se editar o arquivo SVG no disco, pressione **`R`** para recarregar sem reiniciar a página.
   - Teste as cores nos seletores de paleta.
5. Clique em **Copiar config** e cole os valores atualizados em `src/game/config/rigConfig.ts` e `src/game/config/paletteConfig.ts`.

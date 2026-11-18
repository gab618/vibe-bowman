# Registro de Decisões Técnicas (`DECISIONS.md`)

Decisões tomadas durante a implementação da v1 seguindo `plan.md`:

1. **Detecção de 404 do Vite para SVGs ausentes (`assetLoader.ts`):**
   Em desenvolvimento, o Vite retorna `index.html` com HTTP `200 OK` para rotas inexistentes em `public/`. Portanto, o `AssetLoader` valida que a resposta do `fetch` realmente contém `<svg` antes de aceitar o arquivo; caso contrário, ativa o fallback geométrico.

2. **Substituição de cores-token via string + Blob URL (`assetLoader.ts`):**
   A substituição dos tokens hexadecimais é feita diretamente sobre o texto do SVG nos atributos `fill`, `stroke`, `stop-color`, `style` e regras CSS internas (`<style>`), mantendo o processamento puro e testável no Vitest sem depender de DOMParser.

3. **Direção de dobra do cotovelo na IK de 2 ossos (`rig.ts`):**
   Quando a força chega perto de 100%, a mão da corda passa atrás da linha do ombro (`0.55 - (0.15 + 0.45 * 1.0) = -0.05 m`), invertendo o vetor ombro→mão. Para evitar que o cotovelo dê um salto brusco para baixo, `solveTwoBoneIK` recebe um vetor `bendHint` em coordenadas de mundo e escolhe o lado perpendicular com maior produto escalar em relação a `bendHint`.

4. **Espelhamento universal de peças SVG (`renderer.ts`):**
   Ao desenhar peças ósseas e o arco com `facing = -1`, o espelhamento é aplicado perpendicularmente ao eixo do osso (`scale(scaleLen, scaleWid * facing)` antes de `rotate(-svgAngle)`). Isso preserva a orientação vertical correta tanto para peças desenhadas na horizontal (braços/pernas) quanto para peças desenhadas na vertical (tronco/cabeça) em qualquer ângulo ou ragdoll.

5. **Resolução das pontas da corda no arco (`renderer.ts`):**
   Quando `bow.svg` está carregado, as posições em tela de `stringTop` e `stringBottom` são transformadas a partir das coordenadas declaradas no `rigConfig.bow` para que a corda conecte exatamente às pontas desenhadas pelo artista. Quando em fallback, usam-se as pontas geométricas calculadas em `rig.ts`.

6. **Estrutura dos templates SVG (`asset-templates/`):**
   Os modelos incluem um grupo `<g id="reference-markers">` marcando `anchor`/`tip`/`grip` em cores que não conflitam com os tokens (`#00C853` e `#FF9100`), com instruções em comentário para ocultar ou remover antes de exportar para `public/assets/`.

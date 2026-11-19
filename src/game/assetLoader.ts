import {
  paletteConfig,
  TOKEN_HEX,
  type PaletteConfig,
  type PlayerId,
  type PlayerPalette,
  type TokenName,
} from './config/paletteConfig';
import { rigConfig, type PartName } from './config/rigConfig';

export type AssetKey = PartName | 'bow' | 'arrow';

export interface LoadedSvgAsset {
  image: HTMLImageElement;
  viewBoxWidth: number;
  viewBoxHeight: number;
  rasterScale: number;
}

const TOKEN_ENTRIES: Array<[TokenName, string]> = Object.entries(TOKEN_HEX) as Array<
  [TokenName, string]
>;

/**
 * Replaces token hex colors (case-insensitive) inside SVG presentation attributes and style properties.
 * Non-token colors are preserved untouched.
 */
export function replaceSvgTokens(svgText: string, palette: PlayerPalette): string {
  let result = svgText;
  for (const [tokenName, tokenHex] of TOKEN_ENTRIES) {
    const replacement = palette[tokenName];
    const escapedHex = tokenHex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match token inside fill="...", stroke="...", stop-color="...", or style="... #HEX ..."
    const attrPattern = new RegExp(
      `((?:fill|stroke|stop-color)\\s*=\\s*["'])${escapedHex}(["'])`,
      'gi'
    );
    result = result.replace(attrPattern, `$1${replacement}$2`);

    const stylePattern = new RegExp(
      `(style\\s*=\\s*["'][^"']*?)${escapedHex}([^"']*?["'])`,
      'gi'
    );
    // Repeat while matches remain in case multiple tokens appear in one style attribute
    while (stylePattern.test(result)) {
      result = result.replace(stylePattern, `$1${replacement}$2`);
    }

    // Also handle <style>...</style> CSS rules for fill/stroke/stop-color
    const cssPropPattern = new RegExp(
      `((?:fill|stroke|stop-color)\\s*:\\s*)${escapedHex}`,
      'gi'
    );
    result = result.replace(cssPropPattern, `$1${replacement}`);
  }
  return result;
}

export interface SvgDimensionsResult {
  svgText: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
}

/**
 * Ensures root <svg> element has explicit width and height attributes scaled by rasterScale.
 * If width/height are missing, derives them from viewBox.
 */
export function ensureSvgDimensions(svgText: string, rasterScale: number = 4): SvgDimensionsResult {
  const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) {
    return { svgText, viewBoxWidth: 100, viewBoxHeight: 100 };
  }

  const attrs = svgTagMatch[1];
  const vbMatch = attrs.match(/viewBox\s*=\s*["']\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*["']/i);
  const widthMatch = attrs.match(/\bwidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
  const heightMatch = attrs.match(/\bheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);

  const vbWidth = vbMatch ? parseFloat(vbMatch[3]) : widthMatch ? parseFloat(widthMatch[1]) : 100;
  const vbHeight = vbMatch ? parseFloat(vbMatch[4]) : heightMatch ? parseFloat(heightMatch[1]) : 100;

  const baseWidth = widthMatch ? parseFloat(widthMatch[1]) : vbWidth;
  const baseHeight = heightMatch ? parseFloat(heightMatch[1]) : vbHeight;

  const scaledW = Math.round(baseWidth * rasterScale);
  const scaledH = Math.round(baseHeight * rasterScale);

  let newAttrs = attrs;
  if (widthMatch) {
    newAttrs = newAttrs.replace(/\bwidth\s*=\s*["'][^"']*["']/i, `width="${scaledW}"`);
  } else {
    newAttrs += ` width="${scaledW}"`;
  }

  if (heightMatch) {
    newAttrs = newAttrs.replace(/\bheight\s*=\s*["'][^"']*["']/i, `height="${scaledH}"`);
  } else {
    newAttrs += ` height="${scaledH}"`;
  }

  if (!vbMatch) {
    newAttrs += ` viewBox="0 0 ${vbWidth} ${vbHeight}"`;
  }

  const updated = svgText.replace(/<svg\b[^>]*>/i, `<svg${newAttrs}>`);
  return {
    svgText: updated,
    viewBoxWidth: vbWidth,
    viewBoxHeight: vbHeight,
  };
}

export function processSvgForPalette(
  rawSvg: string,
  palette: PlayerPalette,
  rasterScale: number
): SvgDimensionsResult {
  const colored = replaceSvgTokens(rawSvg, palette);
  return ensureSvgDimensions(colored, rasterScale);
}

export class AssetLoader {
  private rawSvgs = new Map<AssetKey, string>();
  private cache = new Map<string, LoadedSvgAsset>();

  private cacheKey(key: AssetKey, player: PlayerId): string {
    return `${key}:${player}`;
  }

  private getAssetFiles(): Array<[AssetKey, string]> {
    return [
      ['head', rigConfig.parts.head.src],
      ['torso', rigConfig.parts.torso.src],
      ['upperArm', rigConfig.parts.upperArm.src],
      ['forearm', rigConfig.parts.forearm.src],
      ['thigh', rigConfig.parts.thigh.src],
      ['shin', rigConfig.parts.shin.src],
      ['bow', rigConfig.bow.src],
      ['arrow', rigConfig.arrow.src],
    ];
  }

  async loadAll(palettes: PaletteConfig = paletteConfig): Promise<void> {
    this.rawSvgs.clear();
    this.cache.clear();

    const files = this.getAssetFiles();
    await Promise.all(
      files.map(async ([key, filename]) => {
        try {
          const url = `/assets/${filename}?t=${Date.now()}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const text = await res.text();
          // Guard against Vite SPA fallback returning index.html on 404
          if (!text.includes('<svg')) return;
          this.rawSvgs.set(key, text);
        } catch {
          // Missing asset triggers geometric fallback gracefully
        }
      })
    );

    await this.rebuildPalettes(palettes);
  }

  async rebuildPalettes(palettes: PaletteConfig = paletteConfig): Promise<void> {
    this.cache.clear();
    const rasterScale = rigConfig.assetRasterScale;
    const playerIds: PlayerId[] = ['blue', 'black'];

    const tasks: Promise<void>[] = [];
    for (const [key, raw] of this.rawSvgs.entries()) {
      for (const playerId of playerIds) {
        tasks.push(this.rasterizeVariant(key, playerId, raw, palettes.players[playerId], rasterScale));
      }
    }
    await Promise.all(tasks);
  }

  private async rasterizeVariant(
    key: AssetKey,
    playerId: PlayerId,
    rawSvg: string,
    palette: PlayerPalette,
    rasterScale: number
  ): Promise<void> {
    const processed = processSvgForPalette(rawSvg, palette, rasterScale);
    const blob = new Blob([processed.svgText], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const img = new Image();
      img.src = blobUrl;
      await img.decode();
      this.cache.set(this.cacheKey(key, playerId), {
        image: img,
        viewBoxWidth: processed.viewBoxWidth,
        viewBoxHeight: processed.viewBoxHeight,
        rasterScale,
      });
    } catch {
      // Fall back to geometric shape if decoding fails
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  getAsset(key: AssetKey, player: PlayerId): LoadedSvgAsset | null {
    return this.cache.get(this.cacheKey(key, player)) ?? null;
  }

  hasAnySvg(): boolean {
    return this.rawSvgs.size > 0;
  }

  async reloadAssets(palettes: PaletteConfig = paletteConfig): Promise<void> {
    await this.loadAll(palettes);
  }
}

export type PlayerId = 'blue' | 'black';

export type TokenName =
  | 'bodyPrimary'
  | 'bodyDetail'
  | 'bowWood'
  | 'arrowFletching'
  | 'arrowShaft';

export const TOKEN_HEX: Record<TokenName, string> = {
  bodyPrimary: '#FF00FF',
  bodyDetail: '#00FFFF',
  bowWood: '#FFFF00',
  arrowFletching: '#00FF00',
  arrowShaft: '#FF8000',
};

export interface PlayerPalette {
  bodyPrimary: string;
  bodyDetail: string;
  bowWood: string;
  arrowFletching: string;
  arrowShaft: string;
}

export interface PaletteConfig {
  world: {
    paperBg: string;
    paperNoise: string;
    terrainFill: string;
    bowString: string;
    blood: string;
    dust: string;
    aimLine: string;
    aimGhost: string;
  };
  players: Record<PlayerId, PlayerPalette>;
}

export function createDefaultPaletteConfig(): PaletteConfig {
  return {
    world: {
      paperBg: '#F4EFE6',
      paperNoise: '#D8CFC0',
      terrainFill: '#1A1A1D',
      bowString: '#2C2A29',
      blood: '#B3261E',
      dust: '#4A4A52',
      aimLine: '#1A1A1D',
      aimGhost: 'rgba(26, 26, 29, 0.28)',
    },
    players: {
      blue: {
        bodyPrimary: '#2F5DA8',
        bodyDetail: '#1E3F78',
        bowWood: '#6B4A2B',
        arrowFletching: '#2F5DA8',
        arrowShaft: '#3B2F25',
      },
      black: {
        bodyPrimary: '#1F1F24',
        bodyDetail: '#3A3A42',
        bowWood: '#6B4A2B',
        arrowFletching: '#1F1F24',
        arrowShaft: '#3B2F25',
      },
    },
  };
}

export const paletteConfig: PaletteConfig = createDefaultPaletteConfig();

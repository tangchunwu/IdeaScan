import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Skin = "ghibli" | "street" | "drift" | "cotton";

export interface SkinMeta {
  id: Skin;
  name: string;
  emoji: string;
  description: string;
  colors: [string, string]; // Two preview colors
}

export const SKINS: SkinMeta[] = [
  {
    id: "ghibli",
    name: "宫崎骏猫咪",
    emoji: "🐱",
    description: "柔和自然，温暖治愈",
    colors: ["#4AADE8", "#5DB86C"],
  },
  {
    id: "street",
    name: "阿橘街头风",
    emoji: "😎",
    description: "暗色潮酷，克制张扬",
    colors: ["#E8874A", "#1C1C1E"],
  },
  {
    id: "drift",
    name: "漂漂水獭",
    emoji: "🦦",
    description: "慢节奏漂流，自然宁静",
    colors: ["#6A9FB5", "#A8C4A0"],
  },
  {
    id: "cotton",
    name: "棉棉兔兔",
    emoji: "🐰",
    description: "柔软治愈，温柔陪伴",
    colors: ["#D4A5C9", "#F2C4CE"],
  },
];

interface ThemeState {
  skin: Skin;
  setSkin: (skin: Skin) => void;
}

const applySkin = (skin: Skin) => {
  document.documentElement.dataset.skin = skin;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      skin: "ghibli",
      setSkin: (skin) => {
        applySkin(skin);
        set({ skin });
      },
    }),
    {
      name: "ideascan-skin",
      onRehydrateStorage: () => (state) => {
        if (state?.skin) {
          applySkin(state.skin);
        }
      },
    }
  )
);

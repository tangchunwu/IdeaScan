import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserSettings {
       // LLM Settings
       llmProvider: 'openai' | 'deepseek' | 'custom';
       llmBaseUrl: string;
       llmApiKey: string;
       llmModel: string;

       // Tikhub Settings
       tikhubToken: string;
}

interface SettingsState extends UserSettings {
       updateSettings: (settings: Partial<UserSettings>) => void;
       resetSettings: () => void;
}

const defaultSettings: UserSettings = {
       llmProvider: 'openai',
       llmBaseUrl: 'https://api.openai.com/v1',
       llmApiKey: '',
       llmModel: 'gpt-4o',
       tikhubToken: '',
};

export const useSettings = create<SettingsState>()(
       persist(
              (set) => ({
                     ...defaultSettings,
                     updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
                     resetSettings: () => set(defaultSettings),
              }),
              {
                     name: 'user-settings', // name of the item in the storage (must be unique)
              }
       )
);

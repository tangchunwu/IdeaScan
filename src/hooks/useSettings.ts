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

       // Search Settings
       bochaApiKey: string;
       youApiKey: string;
       tavilyApiKey: string;
       // Image Generation Settings (OpenAI Compatible)
       imageGenBaseUrl: string;
       imageGenApiKey: string;
       imageGenModel: string;
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
       bochaApiKey: '',
       youApiKey: '',
       tavilyApiKey: '',
       imageGenBaseUrl: 'https://api.openai.com/v1',
       imageGenApiKey: '',
       imageGenModel: 'dall-e-3',
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

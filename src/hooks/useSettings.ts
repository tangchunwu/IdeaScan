import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

export interface UserSettings {
  // LLM Settings
  llmProvider: 'openai' | 'deepseek' | 'custom';
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;

  // Tikhub Settings
  tikhubToken: string;

  // Data Source Settings
  enableXiaohongshu: boolean;
  enableDouyin: boolean;

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
  // State
  isLoading: boolean;
  isSynced: boolean;
  lastSyncError: string | null;

  // Actions
  updateSettings: (settings: Partial<UserSettings>) => void;
  resetSettings: () => void;

  // Cloud sync actions
  syncFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<void>;
}

const defaultSettings: UserSettings = {
  llmProvider: 'openai',
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  llmModel: 'gpt-4o',
  tikhubToken: '',
  enableXiaohongshu: true,
  enableDouyin: false,
  bochaApiKey: '',
  youApiKey: '',
  tavilyApiKey: '',
  imageGenBaseUrl: 'https://api.openai.com/v1',
  imageGenApiKey: '',
  imageGenModel: 'dall-e-3',
};

// Extract only settings fields (not state/actions)
const extractSettingsOnly = (state: Partial<SettingsState>): Partial<UserSettings> => {
  const { isLoading, isSynced, lastSyncError, updateSettings, resetSettings, syncFromCloud, syncToCloud, ...settings } = state;
  return settings;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      isLoading: false,
      isSynced: false,
      lastSyncError: null,

      updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings, isSynced: false })),

      resetSettings: () => set({ ...defaultSettings, isSynced: false }),

      syncFromCloud: async () => {
        set({ isLoading: true, lastSyncError: null });

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            set({ isLoading: false });
            return;
          }

          const { data, error } = await supabase.functions.invoke('user-settings', {
            method: 'GET',
          });

          if (error) {
            throw error;
          }

          if (data?.settings) {
            // Merge cloud settings with defaults (in case new fields were added)
            const cloudSettings = { ...defaultSettings, ...data.settings };
            set({
              ...cloudSettings,
              isLoading: false,
              isSynced: true,
              lastSyncError: null
            });
            console.log('Settings synced from cloud');
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Failed to sync settings from cloud:', error);
          set({
            isLoading: false,
            lastSyncError: error instanceof Error ? error.message : 'Sync failed'
          });
        }
      },

      syncToCloud: async () => {
        const state = get();
        if (state.isSynced) return; // Already synced

        set({ isLoading: true, lastSyncError: null });

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            set({ isLoading: false });
            return;
          }

          const settingsToSync = extractSettingsOnly(state);

          const { error } = await supabase.functions.invoke('user-settings', {
            method: 'POST',
            body: { settings: settingsToSync },
          });

          if (error) {
            throw error;
          }

          set({ isLoading: false, isSynced: true, lastSyncError: null });
          console.log('Settings synced to cloud');
        } catch (error) {
          console.error('Failed to sync settings to cloud:', error);
          set({
            isLoading: false,
            lastSyncError: error instanceof Error ? error.message : 'Sync failed'
          });
        }
      },
    }),
    {
      name: 'user-settings',
      // Only persist non-sensitive fields locally as backup
      partialize: (state) => ({
        llmProvider: state.llmProvider,
        llmBaseUrl: state.llmBaseUrl,
        llmModel: state.llmModel,
        enableXiaohongshu: state.enableXiaohongshu,
        enableDouyin: state.enableDouyin,
        imageGenBaseUrl: state.imageGenBaseUrl,
        imageGenModel: state.imageGenModel,
        // API keys are NOT persisted locally for security
        // They will be synced from cloud on login
      }),
    }
  )
);

// Auto-sync when user logs in
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // Sync settings from cloud on login
    setTimeout(() => {
      useSettings.getState().syncFromCloud();
    }, 500);
  } else if (event === 'SIGNED_OUT') {
    // Clear sensitive data on logout
    useSettings.getState().resetSettings();
  }
});

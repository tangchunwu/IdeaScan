import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { invokeFunction } from '@/lib/invokeFunction';

export interface UserSettings {
  llmFallbacks: Array<{
    baseUrl: string;
    apiKey: string;
    model: string;
  }>;

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
  enableSelfCrawler: boolean;
  enableTikhubFallback: boolean;

  // Search Settings
  bochaApiKey: string;
  youApiKey: string;
  tavilyApiKey: string;

  // Image Generation Settings (OpenAI Compatible)
  imageGenBaseUrl: string;
  imageGenApiKey: string;
  imageGenModel: string;
}

type PersistedSettings = Omit<Partial<UserSettings>, 'llmFallbacks'> & {
  llmFallbacks?: Array<Omit<UserSettings['llmFallbacks'][number], 'apiKey'>>;
};

interface SettingsState extends UserSettings {
  // State
  isLoading: boolean;
  isSynced: boolean;
  lastSyncError: string | null;

  // Actions
  updateSettings: (settings: Partial<UserSettings>) => void;
  resetSettings: () => void;
  clearSensitiveSettings: () => void;

  // Cloud sync actions
  syncFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<void>;
}

const defaultSettings: UserSettings = {
  llmFallbacks: [],
  llmProvider: 'openai',
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  llmModel: 'gpt-4o',
  tikhubToken: '',
  enableXiaohongshu: true,
  enableDouyin: false,
  // Global policy: social crawling is TikHub-only.
  enableSelfCrawler: false,
  enableTikhubFallback: true,
  bochaApiKey: '',
  youApiKey: '',
  tavilyApiKey: '',
  imageGenBaseUrl: 'https://api.openai.com/v1',
  imageGenApiKey: '',
  imageGenModel: 'dall-e-3',
};

let settingsSessionVersion = 0;

const stripSecrets = (settings: Partial<UserSettings>): PersistedSettings => ({
  ...settings,
  llmFallbacks: Array.isArray(settings.llmFallbacks)
    ? settings.llmFallbacks.map(({ apiKey: _apiKey, ...fallback }) => fallback)
    : [],
  llmApiKey: undefined,
  tikhubToken: undefined,
  bochaApiKey: undefined,
  youApiKey: undefined,
  tavilyApiKey: undefined,
  imageGenApiKey: undefined,
});

const hasOwn = (value: unknown, key: string): boolean =>
  !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);

const mergePersistedSettings = (
  persistedState: unknown,
  currentState: SettingsState,
): SettingsState => {
  const persisted = (persistedState || {}) as Partial<SettingsState>;
  const merged = { ...currentState, ...persisted };

  // Fresh persisted states omit secrets. Keep the current tab's in-memory
  // values so saving a preference does not clear keys entered this session.
  for (const key of [
    'llmApiKey',
    'tikhubToken',
    'bochaApiKey',
    'youApiKey',
    'tavilyApiKey',
    'imageGenApiKey',
  ] as const) {
    if (!hasOwn(persisted, key)) {
      merged[key] = currentState[key];
    }
  }

  if (Array.isArray(persisted.llmFallbacks)) {
    merged.llmFallbacks = persisted.llmFallbacks.map((fallback, index) => ({
      ...fallback,
      // Legacy entries retain their key during migration. New entries use the
      // key already held in this browser session, if one exists at this index.
      apiKey: typeof fallback.apiKey === 'string'
        ? fallback.apiKey
        : currentState.llmFallbacks[index]?.apiKey || '',
    }));
  }

  return merged;
};

// Extract only settings fields (not state/actions)
const extractSettingsOnly = (state: Partial<SettingsState>): Partial<UserSettings> => {
  const {
    isLoading,
    isSynced,
    lastSyncError,
    updateSettings,
    resetSettings,
    clearSensitiveSettings,
    syncFromCloud,
    syncToCloud,
    ...settings
  } = state;
  return settings;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      isLoading: false,
      isSynced: false,
      lastSyncError: null,

      updateSettings: (newSettings) => set((state) => ({
        ...state,
        ...newSettings,
        enableDouyin: false,
        enableSelfCrawler: false,
        enableTikhubFallback: true,
        isSynced: false
      })),

      resetSettings: () => {
        settingsSessionVersion += 1;
        set({ ...defaultSettings, isSynced: false, isLoading: false });
      },

      clearSensitiveSettings: () => {
        settingsSessionVersion += 1;
        set((state) => ({
        ...state,
        llmApiKey: '',
        tikhubToken: '',
        bochaApiKey: '',
        youApiKey: '',
        tavilyApiKey: '',
        imageGenApiKey: '',
        llmFallbacks: state.llmFallbacks.map((fallback) => ({ ...fallback, apiKey: '' })),
        isSynced: false,
        isLoading: false,
      }));
      },

      syncFromCloud: async () => {
        const sessionVersion = settingsSessionVersion;
        set({ isLoading: true, lastSyncError: null });

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (sessionVersion !== settingsSessionVersion) return;
          if (!session) {
            set({ isLoading: false });
            return;
          }

          const { data, error } = await invokeFunction<{ settings: Partial<UserSettings> | null }>('user-settings', {
            method: 'GET',
          }, true);
          if (sessionVersion !== settingsSessionVersion) return;

          if (error) {
            throw error;
          }

          if (data?.settings) {
            // Merge cloud settings with defaults (in case new fields were added)
            const cloudSettings = { ...defaultSettings, ...data.settings };
            set({
              ...cloudSettings,
              enableDouyin: false,
              enableSelfCrawler: false,
              enableTikhubFallback: true,
              isLoading: false,
              isSynced: true,
              lastSyncError: null
            });
            // Settings synced from cloud
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          if (sessionVersion !== settingsSessionVersion) return;
          console.error('Failed to sync settings from cloud:', error);
          set({
            isLoading: false,
            lastSyncError: error instanceof Error ? error.message : 'Sync failed'
          });
        }
      },

      syncToCloud: async () => {
        const sessionVersion = settingsSessionVersion;
        const state = get();
        if (state.isSynced) return; // Already synced

        set({ isLoading: true, lastSyncError: null });

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (sessionVersion !== settingsSessionVersion) return;
          if (!session) {
            set({ isLoading: false });
            return;
          }

          const settingsToSync = extractSettingsOnly(state);

          const { error } = await invokeFunction('user-settings', {
            method: 'POST',
            body: { settings: settingsToSync },
          }, true);
          if (sessionVersion !== settingsSessionVersion) return;

          if (error) {
            throw error;
          }

          set({ isLoading: false, isSynced: true, lastSyncError: null });
          // Settings synced to cloud
        } catch (error) {
          if (sessionVersion !== settingsSessionVersion) return;
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
      version: 1,
      migrate: (persistedState) => persistedState as Partial<SettingsState>,
      merge: (persistedState, currentState) => ({
        ...mergePersistedSettings(persistedState, currentState as SettingsState),
        enableDouyin: false,
        enableSelfCrawler: false,
        enableTikhubFallback: true,
      }),
      // Secrets remain available in memory, but never enter localStorage.
      partialize: (state) => stripSecrets(extractSettingsOnly(state)),
    }
  )
);

// Preferences use localStorage; secrets are session-memory only. Users can
// manually sync the complete runtime settings through the existing cloud API.

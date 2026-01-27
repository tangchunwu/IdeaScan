import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettings } from '@/hooks/useSettings';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
        supabase: {
                auth: {
                        getSession: vi.fn(),
                        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
                },
                functions: {
                        invoke: vi.fn(),
                },
        },
}));

import { supabase } from '@/integrations/supabase/client';

describe('useSettings', () => {
        beforeEach(() => {
                vi.clearAllMocks();
                // Reset store state
                useSettings.setState({
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
                        isLoading: false,
                        isSynced: false,
                        lastSyncError: null,
                });
        });

        it('should have default settings', () => {
                const state = useSettings.getState();
                expect(state.llmProvider).toBe('openai');
                expect(state.llmModel).toBe('gpt-4o');
                expect(state.enableXiaohongshu).toBe(true);
                expect(state.enableDouyin).toBe(false);
        });

        it('should update settings correctly', () => {
                const { updateSettings } = useSettings.getState();

                updateSettings({ llmProvider: 'deepseek', llmModel: 'deepseek-chat' });

                const state = useSettings.getState();
                expect(state.llmProvider).toBe('deepseek');
                expect(state.llmModel).toBe('deepseek-chat');
                expect(state.isSynced).toBe(false); // Should mark as not synced
        });

        it('should reset settings to defaults', () => {
                const { updateSettings, resetSettings } = useSettings.getState();

                // First update
                updateSettings({ llmProvider: 'custom', llmApiKey: 'test-key' });

                // Then reset
                resetSettings();

                const state = useSettings.getState();
                expect(state.llmProvider).toBe('openai');
                expect(state.llmApiKey).toBe('');
        });

        it('syncFromCloud should fetch settings from cloud', async () => {
                (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
                        data: { session: { access_token: 'fake-token' } },
                });

                (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
                        data: {
                                settings: {
                                        llmProvider: 'deepseek',
                                        llmModel: 'deepseek-v3',
                                }
                        },
                        error: null,
                });

                await useSettings.getState().syncFromCloud();

                const state = useSettings.getState();
                expect(state.llmProvider).toBe('deepseek');
                expect(state.llmModel).toBe('deepseek-v3');
                expect(state.isSynced).toBe(true);
        });

        it('syncFromCloud should handle no session gracefully', async () => {
                (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
                        data: { session: null },
                });

                await useSettings.getState().syncFromCloud();

                expect(supabase.functions.invoke).not.toHaveBeenCalled();
        });
});

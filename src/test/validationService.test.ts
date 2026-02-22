import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createValidation } from '@/services/validationService';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
        supabase: {
                auth: {
                        getSession: vi.fn(),
                        getUser: vi.fn(),
                        refreshSession: vi.fn(),
                        signOut: vi.fn(),
                },
                functions: {
                        invoke: vi.fn(),
                },
        },
}));

import { supabase } from '@/integrations/supabase/client';

describe('validationService', () => {
        beforeEach(() => {
                vi.clearAllMocks();
                vi.stubGlobal('fetch', vi.fn());
        });

        it('createValidation should invoke validate-idea function', async () => {
                // Mock session
                (supabase.auth.getSession as any).mockResolvedValue({
                        data: { session: { access_token: 'fake-token' } },
                });
                (supabase.auth.getUser as any).mockResolvedValue({
                        data: { user: { id: 'u1' } },
                        error: null,
                });

                (global.fetch as any).mockResolvedValue({
                        ok: true,
                        text: async () => JSON.stringify({ success: true, validationId: '123', overallScore: 80 }),
                });

                const request = {
                        idea: 'Test Idea',
                        tags: ['test'],
                };

                const result = await createValidation(request);

                expect(result).toEqual({ success: true, validationId: '123', overallScore: 80 });
                expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('createValidation should throw error if not logged in', async () => {
                (supabase.auth.getSession as any).mockResolvedValue({
                        data: { session: null },
                });

                await expect(createValidation({ idea: '', tags: [] })).rejects.toThrow('请先登录');
        });
});

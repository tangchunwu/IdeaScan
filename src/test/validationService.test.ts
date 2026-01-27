import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createValidation } from '@/services/validationService';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
        supabase: {
                auth: {
                        getSession: vi.fn(),
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
        });

        it('createValidation should invoke validate-idea function', async () => {
                // Mock session
                (supabase.auth.getSession as any).mockResolvedValue({
                        data: { session: { access_token: 'fake-token' } },
                });

                // Mock function invocation
                (supabase.functions.invoke as any).mockResolvedValue({
                        data: { success: true, validationId: '123', overallScore: 80 },
                        error: null,
                });

                const request = {
                        idea: 'Test Idea',
                        tags: ['test'],
                };

                const result = await createValidation(request);

                expect(result).toEqual({ success: true, validationId: '123', overallScore: 80 });
                expect(supabase.functions.invoke).toHaveBeenCalledWith('validate-idea', {
                        body: request,
                });
        });

        it('createValidation should throw error if not logged in', async () => {
                (supabase.auth.getSession as any).mockResolvedValue({
                        data: { session: null },
                });

                await expect(createValidation({ idea: '', tags: [] })).rejects.toThrow('请先登录');
        });
});

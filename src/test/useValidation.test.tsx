import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { validationKeys } from '@/hooks/useValidation';

// Mock the validation service
vi.mock('@/services/validationService', () => ({
        getValidation: vi.fn(),
        listValidations: vi.fn(),
        createValidation: vi.fn(),
        deleteValidation: vi.fn(),
}));

// Mock useSettings
vi.mock('@/hooks/useSettings', () => ({
        useSettings: vi.fn(() => ({
                llmFallbacks: [],
                llmProvider: 'openai',
                llmBaseUrl: 'https://api.openai.com/v1',
                llmApiKey: 'test-key',
                llmModel: 'gpt-4o',
                tikhubToken: 'test-token',
                enableXiaohongshu: true,
                enableDouyin: false,
                enableSelfCrawler: false,
                enableTikhubFallback: true,
                bochaApiKey: '',
                youApiKey: '',
                tavilyApiKey: '',
                imageGenBaseUrl: '',
                imageGenApiKey: '',
                imageGenModel: '',
        })),
}));

vi.mock('@/hooks/useAuth', () => ({
        useAuth: vi.fn(() => ({
                user: { id: 'user-123' },
                session: null,
                isLoading: false,
                signOut: vi.fn(),
        })),
}));

import { getValidation, listValidations, createValidation, deleteValidation } from '@/services/validationService';

describe('validationKeys', () => {
        it('should generate correct query keys', () => {
                expect(validationKeys.all).toEqual(['validations']);
                expect(validationKeys.listRoot).toEqual(['validations', 'list']);
                expect(validationKeys.lists('user-123')).toEqual(['validations', 'list', 'user-123']);
                expect(validationKeys.detail('123')).toEqual(['validations', 'detail', '', '123']);
                expect(validationKeys.detail('123', 'user-123')).toEqual(['validations', 'detail', 'user-123', '123']);
        });
});

describe('useValidation hooks', () => {
        let queryClient: QueryClient;

        beforeEach(() => {
                vi.clearAllMocks();
                queryClient = new QueryClient({
                        defaultOptions: {
                                queries: {
                                        retry: false,
                                },
                        },
                });
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client= { queryClient } > { children } </QueryClientProvider>
  );

it('getValidation should be called with correct id', async () => {
        const mockData = {
                validation: { id: '123', idea: 'Test', status: 'completed' },
                report: null,
        };
        (getValidation as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

        // Import useValidation after mocks are set up
        const { useValidation } = await import('@/hooks/useValidation');

        const { result } = renderHook(() => useValidation('123'), { wrapper });

        await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
        });

        expect(getValidation).toHaveBeenCalledWith('123');
        expect(result.current.data).toEqual(mockData);
});

it('listValidations should return validation list', async () => {
        const mockList = [
                { id: '1', idea: 'Idea 1', status: 'completed' },
                { id: '2', idea: 'Idea 2', status: 'pending' },
        ];
        (listValidations as ReturnType<typeof vi.fn>).mockResolvedValue(mockList);

        const { useValidations } = await import('@/hooks/useValidation');

        const { result } = renderHook(() => useValidations('user-123'), { wrapper });

        await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
        });

        expect(listValidations).toHaveBeenCalled();
        expect(result.current.data).toEqual(mockList);
});

it('should use separate caches when the user changes', async () => {
        const userAList = [{ id: 'a', idea: 'User A', status: 'completed' }];
        const userBList = [{ id: 'b', idea: 'User B', status: 'completed' }];
        queryClient.setQueryData(validationKeys.lists('user-a'), userAList);
        queryClient.setQueryData(validationKeys.lists('user-b'), userBList);

        const { useValidations } = await import('@/hooks/useValidation');
        const { result, rerender } = renderHook(
                ({ userId }) => useValidations(userId),
                { initialProps: { userId: 'user-a' }, wrapper },
        );

        expect(result.current.data).toEqual(userAList);
        rerender({ userId: 'user-b' });

        await waitFor(() => {
                expect(result.current.data).toEqual(userBList);
        });
        expect(listValidations).not.toHaveBeenCalled();
});

it('createValidation mutation should work correctly', async () => {
        queryClient.setQueryData(validationKeys.lists('user-123'), []);
        const mockResponse = { success: true, validationId: 'new-123', overallScore: 85 };
        (createValidation as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

        const { useCreateValidation } = await import('@/hooks/useValidation');

        const { result } = renderHook(() => useCreateValidation(), { wrapper });

        result.current.mutate({ idea: 'New Idea', tags: ['test'] });

        await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
        });

        expect(createValidation).toHaveBeenCalled();
        expect(queryClient.getQueryState(validationKeys.lists('user-123'))?.isInvalidated).toBe(true);
});

it('deleteValidation should invalidate the current user list and remove its detail cache', async () => {
        (deleteValidation as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
        const detailKey = validationKeys.detail('123', 'user-123');
        queryClient.setQueryData(validationKeys.lists('user-123'), [{ id: '123' }]);
        queryClient.setQueryData(detailKey, { validation: { id: '123' } });

        const { useDeleteValidation } = await import('@/hooks/useValidation');
        const { result } = renderHook(() => useDeleteValidation(), { wrapper });
        result.current.mutate('123');

        await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
        });

        expect(queryClient.getQueryData(detailKey)).toBeUndefined();
        expect(queryClient.getQueryState(validationKeys.lists('user-123'))?.isInvalidated).toBe(true);
});
});

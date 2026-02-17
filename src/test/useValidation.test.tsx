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
                llmProvider: 'openai',
                llmBaseUrl: 'https://api.openai.com/v1',
                llmApiKey: 'test-key',
                llmModel: 'gpt-4o',
                tikhubToken: 'test-token',
                enableXiaohongshu: true,
                enableDouyin: false,
                enableSelfCrawler: true,
                enableTikhubFallback: true,
                bochaApiKey: '',
                youApiKey: '',
                tavilyApiKey: '',
                imageGenBaseUrl: '',
                imageGenApiKey: '',
                imageGenModel: '',
        })),
}));

import { getValidation, listValidations, createValidation } from '@/services/validationService';

describe('validationKeys', () => {
        it('should generate correct query keys', () => {
                expect(validationKeys.all).toEqual(['validations']);
                expect(validationKeys.lists()).toEqual(['validations', 'list']);
                expect(validationKeys.detail('123')).toEqual(['validations', 'detail', '123']);
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

it('createValidation mutation should work correctly', async () => {
        const mockResponse = { success: true, validationId: 'new-123', overallScore: 85 };
        (createValidation as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

        const { useCreateValidation } = await import('@/hooks/useValidation');

        const { result } = renderHook(() => useCreateValidation(), { wrapper });

        result.current.mutate({ idea: 'New Idea', tags: ['test'] });

        await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
        });

        expect(createValidation).toHaveBeenCalled();
});
});

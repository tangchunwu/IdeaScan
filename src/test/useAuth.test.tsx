import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
        getSession: vi.fn(),
        getUser: vi.fn(),
        onAuthStateChange: vi.fn(),
        signOut: vi.fn(),
        callback: undefined as ((event: string, session: unknown) => void) | undefined,
        clearSessionSecrets: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
        supabase: {
                auth: {
                        getSession: authMocks.getSession,
                        getUser: authMocks.getUser,
                        onAuthStateChange: authMocks.onAuthStateChange,
                        signOut: authMocks.signOut,
                },
        },
}));

vi.mock('@/lib/posthog', () => ({
        identifyUser: vi.fn(),
        resetUser: vi.fn(),
}));

vi.mock('@/hooks/useSettings', () => ({
        useSettings: (selector: (state: { clearSensitiveSettings: () => void }) => unknown) =>
                selector({ clearSensitiveSettings: authMocks.clearSessionSecrets }),
}));

const user = { id: 'user-123', email: 'user@example.com', created_at: '2026-01-01T00:00:00.000Z' };
const session = { access_token: 'token-123', user };

describe('AuthProvider', () => {
        beforeEach(() => {
                vi.clearAllMocks();
                authMocks.callback = undefined;
                authMocks.onAuthStateChange.mockImplementation((callback) => {
                        authMocks.callback = callback;
                        return { data: { subscription: { unsubscribe: vi.fn() } } };
                });
                authMocks.getSession.mockResolvedValue({ data: { session: null } });
                authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
                authMocks.signOut.mockResolvedValue({ error: null });
        });

        const createWrapper = () => {
                const queryClient = new QueryClient();
                queryClient.setQueryData(['validations', 'list', 'user-123'], [{ id: 'private' }]);
                const wrapper = ({ children }: { children: React.ReactNode }) => (
                        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                );
                return { queryClient, wrapper };
        };

        it('finishes loading when there is no initial session', async () => {
                const { AuthProvider, useAuth } = await import('@/hooks/useAuth');
                const { wrapper: QueryWrapper } = createWrapper();
                const { result } = renderHook(() => useAuth(), {
                        wrapper: ({ children }) => (
                                <QueryWrapper><AuthProvider>{children}</AuthProvider></QueryWrapper>
                        ),
                });
                await waitFor(() => expect(result.current.isLoading).toBe(false));
                expect(result.current.user).toBeNull();
        });

        it('clears cached private data when the auth session is signed out', async () => {
                const { queryClient, wrapper: QueryWrapper } = createWrapper();
                const { AuthProvider, useAuth } = await import('@/hooks/useAuth');
                const { result } = renderHook(() => useAuth(), {
                        wrapper: ({ children }) => (
                                <QueryWrapper>
                                        <AuthProvider>{children}</AuthProvider>
                                </QueryWrapper>
                        ),
                });

                await waitFor(() => expect(authMocks.callback).toBeDefined());
                await act(async () => authMocks.callback?.('SIGNED_OUT', null));

                expect(result.current.user).toBeNull();
                expect(queryClient.getQueryData(['validations', 'list', 'user-123'])).toBeUndefined();
                expect(authMocks.clearSessionSecrets).toHaveBeenCalled();
        });

        it('does not restore an old user when getUser resolves after SIGNED_OUT', async () => {
                let resolveGetUser: ((value: unknown) => void) | undefined;
                authMocks.getSession.mockResolvedValue({ data: { session } });
                authMocks.getUser.mockReturnValue(new Promise((resolve) => {
                        resolveGetUser = resolve;
                }));

                const { AuthProvider, useAuth } = await import('@/hooks/useAuth');
                const { wrapper: QueryWrapper } = createWrapper();
                const { result } = renderHook(() => useAuth(), {
                        wrapper: ({ children }) => (
                                <QueryWrapper><AuthProvider>{children}</AuthProvider></QueryWrapper>
                        ),
                });

                await waitFor(() => expect(authMocks.getUser).toHaveBeenCalled());
                await act(async () => authMocks.callback?.('SIGNED_OUT', null));
                await act(async () => resolveGetUser?.({ data: { user }, error: null }));

                await waitFor(() => {
                        expect(result.current.user).toBeNull();
                        expect(result.current.session).toBeNull();
                });
        });
});

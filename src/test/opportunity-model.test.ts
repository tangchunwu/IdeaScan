import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeOpportunitySources, validateRadarModel } from '../../supabase/functions/opportunity-discover/model';

const model = { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-only', model: 'gpt-4o' };
afterEach(() => vi.unstubAllGlobals());
describe('radar model safety', () => {
  it('only accepts configured HTTPS domains without credentials or query strings', () => {
    expect(validateRadarModel(model)).toEqual(model);
    for (const url of ['http://api.openai.com/v1', 'https://127.0.0.1', 'https://localhost', 'https://api.openai.com.evil.com', 'https://x:pass@api.openai.com', 'https://api.openai.com?secret=x', 'https://api.openai.com:8443']) {
      expect(() => validateRadarModel({ ...model, baseUrl: url })).toThrow();
    }
    expect(validateRadarModel({ ...model, baseUrl: 'https://proxy.example.com/v1' }, 'proxy.example.com').baseUrl).toContain('proxy.example.com');
  });
  it('issues one bounded call without redirects and does not follow source URLs', async () => {
    vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] })));
    vi.stubGlobal('fetch', fetch);
    const result = await analyzeOpportunitySources({ country: 'US', industry: 'Software', platforms: [], mode: 'quick' }, [], model);
    expect(result).toEqual({ candidates: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'POST' });
  });

  it('uses GPT-6 reasoning parameters for the radar without temperature', async () => {
    vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] })));
    vi.stubGlobal('fetch', fetch);
    await analyzeOpportunitySources(
      { country: 'US', industry: 'Software', platforms: [], mode: 'quick' },
      [],
      { ...model, model: 'gpt-6.1-sol' },
    );
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.reasoning_effort).toBe('low');
    expect(body).not.toHaveProperty('temperature');
  });

  it('falls back from a root Base URL to /v1 automatically', async () => {
    vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal });
    const fetch = vi.fn<typeof globalThis.fetch>();
    fetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] })));
    vi.stubGlobal('fetch', fetch);
    await analyzeOpportunitySources(
      { country: 'US', industry: 'Software', platforms: [], mode: 'quick' },
      [],
      { ...model, baseUrl: 'https://api.openai.com' },
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.openai.com/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ]);
  });
});

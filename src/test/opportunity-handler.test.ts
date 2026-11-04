import { describe, expect, it, vi } from 'vitest';
import { createOpportunityHandler } from '../../supabase/functions/opportunity-discover/handler';

const body = { country: 'US', industry: 'Accounting', platforms: [], mode: 'quick' };
const req = (payload: unknown = body, token = 'user-token') => new Request('https://edge.example.com', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(payload) });

describe('opportunity edge boundary', () => {
  it('takes the research owner from the verified session rather than request fields',async()=>{
    const research=vi.fn(async()=>({candidates:[]}) as never);
    const handler=createOpportunityHandler({authenticate:async()=> 'verified-owner',research});
    expect((await handler(req({...body,userId:'forged-owner',parentResearchId:'11111111-1111-4111-8111-111111111111'}))).status).toBe(200);
    expect(research).toHaveBeenCalledWith(expect.objectContaining({parentResearchId:'11111111-1111-4111-8111-111111111111'}),{},'verified-owner');
  });
  it('rejects missing/invalid sessions before research', async () => {
    const research = vi.fn();
    const handler = createOpportunityHandler({ authenticate: async () => null, research });
    expect((await handler(req(body, ''))).status).toBe(401);
    expect((await handler(req())).status).toBe(401);
    expect(research).not.toHaveBeenCalled();
  });
  it('rejects invalid input and oversized requests', async () => {
    const research = vi.fn();
    const handler = createOpportunityHandler({ authenticate: async () => 'u1', research });
    expect((await handler(req({ ...body, platforms: ['weibo'] }))).status).toBe(400);
    expect((await handler(req({ ...body, config: { llmApiKey: 123 } }))).status).toBe(400);
    expect((await handler(req({ payload: 'x'.repeat(40000) }))).status).toBe(413);
    expect(research).not.toHaveBeenCalled();
  });
  it('limits repeated user research but isolates different users', async () => {
    const research = vi.fn(async () => ({ candidates: [] }) as never);
    const handler = createOpportunityHandler({ authenticate: async token => token, research });
    expect((await handler(req())).status).toBe(200);
    expect((await handler(req())).status).toBe(429);
    expect((await handler(req(body, 'other-user'))).status).toBe(200);
    expect(research).toHaveBeenCalledTimes(2);
  });
  it('does not echo upstream errors or secrets', async () => {
    const handler = createOpportunityHandler({ authenticate: async () => 'u1', research: async () => { throw new Error('secret'); } });
    const response = await handler(req());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

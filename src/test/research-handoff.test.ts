import { describe, expect, it, vi } from 'vitest';
import { loadResearchHandoff } from '../../supabase/functions/_shared/research-handoff';
const id = '11111111-1111-4111-8111-111111111111';
const evidence = {id:'e1', platform:'reddit',title:'原文',snippet:'我每次都用表格手工记录',url:'https://www.reddit.com/r/tools/comments/abc123/',collectedAt:'2026-11-04T00:00:00Z',kind:'fact'};
function db(row: unknown) {
  const query = {select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:row,error:null})};
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  return {from:vi.fn().mockReturnValue(query),query};
}
describe('研究证据安全交接', () => {
  it('用账号和研究ID查询保存原文，按候选返回白名单证据', async () => {
    const client=db({result:{request:{country:'Japan',industry:'hobby',platforms:['reddit'],mode:'quick'},candidates:[{id:'candidate-1',evidence:[{...evidence,apiKey:'never-copy'}]}]}});
    const result=await loadResearchHandoff(client,'owner-a',id,'candidate-1');
    expect(client.query.eq).toHaveBeenCalledWith('user_id','owner-a');
    expect(result.evidence).toEqual([evidence]);
    expect(JSON.stringify(result)).not.toContain('never-copy');
  });
  it('其他账号不可见的研究不得静默退回空证据继续付费', async () => {
    await expect(loadResearchHandoff(db(null),'owner-b',id,'candidate-1')).rejects.toThrow(/研究.*不可用/);
  });
  it('候选不属于研究或引用格式非法时拒绝交接', async () => {
    const client=db({result:{request:{},candidates:[]}});
    await expect(loadResearchHandoff(client,'owner-a',id,'wrong')).rejects.toThrow(/候选/);
    await expect(loadResearchHandoff(client,'owner-a','bad-id','candidate-1')).rejects.toThrow(/引用/);
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchLibrary, ResearchOutcomeEditor } from '@/components/discover/ResearchLibrary';
import type { OpportunityResult } from '@/types/opportunity';
const mocks=vi.hoisted(()=>({save:vi.fn(),list:vi.fn(),outcome:vi.fn()}));
vi.mock('@/services/researchService',()=>({saveResearchSession:mocks.save,listResearchSessions:mocks.list,recordResearchOutcome:mocks.outcome}));
function result(title:string):OpportunityResult{return {schemaVersion:1,fetchedAt:'2026-11-04T00:00:00Z',request:{country:'Japan',industry:title,platforms:[],mode:'quick'},candidates:[],warnings:[],stats:{sourceCount:0,postCount:0,commentCount:0,apiCalls:0,durationMs:0}}}
beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue([]);mocks.outcome.mockResolvedValue(undefined)});afterEach(cleanup);
describe('私有研究档案',()=>{
  it('旧结果保存晚到时，不能把旧档案ID绑定到新结果',async()=>{
    let finish!:(id:string)=>void;mocks.save.mockReturnValue(new Promise<string>(done=>{finish=done}));
    const saved=vi.fn();const restore=vi.fn();const view=render(<ResearchLibrary ownerId="a" result={result('old')} sessionId={null} onSaved={saved} onRestore={restore}/>);
    fireEvent.click(screen.getByRole('button',{name:'保存本次研究'}));
    view.rerender(<ResearchLibrary ownerId="a" result={result('new')} sessionId={null} onSaved={saved} onRestore={restore}/>);
    await act(async()=>finish('old-id'));
    expect(saved).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'保存本次研究'})).toBeEnabled();
  });
  it('切换账号后不展示旧账号晚到的研究',async()=>{
    let finish!:(rows:unknown[])=>void;mocks.list.mockReturnValueOnce(new Promise(done=>{finish=done}));
    const view=render(<ResearchLibrary ownerId="a" result={null} sessionId={null} onSaved={vi.fn()} onRestore={vi.fn()}/>);
    view.rerender(<ResearchLibrary ownerId="b" result={null} sessionId={null} onSaved={vi.fn()} onRestore={vi.fn()}/>);
    await act(async()=>finish([{id:'private-a',createdAt:'2026-11-04',result:result('private research'),outcomes:{}}]));
    expect(screen.queryByText(/private research/)).not.toBeInTheDocument();
  });
  it('存储未部署或保存失败时不声称已保存',async()=>{
    mocks.save.mockRejectedValue(new Error('missing table'));
    render(<ResearchLibrary ownerId="a" result={result('ritual')} sessionId={null} onSaved={vi.fn()} onRestore={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:'保存本次研究'}));
    await screen.findByText(/当前结果尚未保存/);
    expect(screen.queryByText('本次研究已保存')).not.toBeInTheDocument();
  });
  it('恢复后能回读历史购买反馈并保留本人记录边界',async()=>{
    render(<ResearchOutcomeEditor ownerId="a" sessionId="saved" candidateId="c1" initialOutcomes={[{stage:'purchase',note:'一位用户反馈购买，订单尚未核对',source:'self_reported',recordedAt:'2026-11-04T00:00:00Z'}]}/>);
    expect(screen.getByText('一位用户反馈购买，订单尚未核对')).toBeInTheDocument();
    expect(screen.getByText(/本人记录，未独立核实/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('实际验证结果'),{target:{value:'第二次访谈：仍在用表格'}});
    fireEvent.click(screen.getByRole('button',{name:'保存观察结果'}));
    await waitFor(()=>expect(mocks.outcome).toHaveBeenCalledWith('saved','c1','interview','第二次访谈：仍在用表格','a'));
    await screen.findByText('第二次访谈：仍在用表格');
  });
});

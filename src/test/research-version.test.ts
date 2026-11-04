import { describe, expect, it } from 'vitest';
import { nextResearchVersion } from '@/lib/researchVersion';
describe('研究版本',()=>{
  it('新研究从1开始，补证版本递增并保留变化说明',()=>{
    expect(nextResearchVersion()).toEqual({versionNo:1,parentSessionId:null,changeSummary:'首次研究'});
    expect(nextResearchVersion({versionNo:2,id:'parent'})).toEqual({versionNo:3,parentSessionId:'parent',changeSummary:'补充证据后的研究版本'});
  });
  it('非法父版本不会产生可疑版本号',()=>{
    expect(nextResearchVersion({versionNo:-2,id:'parent'}).versionNo).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { isDecisionReady, resolveAnalysisStatus, usableResearchScore } from '../../supabase/functions/_shared/analysis-status';

describe('统一研究状态门禁', () => {
  it('只有完整且有可执行判断的报告才能参加排名', () => {
    expect(isDecisionReady({ analysisStatus: 'complete', decision: 'test' }, {})).toBe(true);
    expect(isDecisionReady({ analysisStatus: 'complete', decision: 'insufficient' }, {})).toBe(false);
    expect(isDecisionReady({ analysisStatus: 'incomplete', decision: 'test' }, {})).toBe(false);
  });
  it('旧报告和缺失字段不补成0分', () => {
    expect(resolveAnalysisStatus({ overallVerdict: '旧报告' }, {})).toBe('legacy');
    expect(usableResearchScore(98, { overallVerdict: '旧报告' }, {})).toBeNull();
    expect(usableResearchScore(0, { analysisStatus: 'complete', decision: 'test' }, {})).toBe(0);
  });
});

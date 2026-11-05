import { describe, expect, it } from 'vitest';
import {
  fallsBackToServerLLM,
  hasUsableUserLLM,
} from '../../supabase/functions/_shared/llm-client';

describe('用户模型配置优先于服务端配置', () => {
  it('官方 OpenAI 地址 + 用户 Key 时，必须使用用户配置而不是回退服务端', () => {
    const config = {
      llmBaseUrl: 'https://api.openai.com/v1',
      llmApiKey: 'sk-user-openai-key',
      llmModel: 'gpt-4o',
    };
    expect(fallsBackToServerLLM(config)).toBe(false);
    expect(hasUsableUserLLM(config)).toBe(true);
  });

  it('官方 OpenAI 地址但没有 Key 时，才回退服务端配置', () => {
    expect(fallsBackToServerLLM({ llmBaseUrl: 'https://api.openai.com/v1', llmApiKey: '' })).toBe(true);
    expect(fallsBackToServerLLM({ llmBaseUrl: 'https://api.openai.com/v1' })).toBe(true);
    expect(hasUsableUserLLM({ llmBaseUrl: 'https://api.openai.com/v1', llmApiKey: '' })).toBe(false);
  });

  it('自建网关地址 + 用户 Key 时使用用户配置', () => {
    const config = {
      llmBaseUrl: 'https://api.minimaxi.com/anthropic',
      llmApiKey: 'sk-cp-user-key',
      llmModel: 'MiniMax-M2',
    };
    expect(fallsBackToServerLLM(config)).toBe(false);
    expect(hasUsableUserLLM(config)).toBe(true);
  });

  it('空白 Key 或缺少 Base URL 都不算用户已配置', () => {
    expect(hasUsableUserLLM({ llmBaseUrl: 'https://api.openai.com/v1', llmApiKey: '   ' })).toBe(false);
    expect(hasUsableUserLLM({ llmApiKey: 'sk-user-openai-key' })).toBe(false);
    expect(hasUsableUserLLM(undefined)).toBe(false);
    expect(fallsBackToServerLLM(undefined)).toBe(false);
  });
});

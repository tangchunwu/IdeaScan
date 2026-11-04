// Report HTML Generator
// Generates complete, self-contained HTML documents for validation reports

import { escapeHtml, escapeHtmlArray } from "./htmlEscape";

interface DimensionData {
  dimension: string;
  score: number;
  reason: string;
}

interface PersonaData {
  name: string;
  role: string;
  age: string;
  income: string;
  painPoints: string[];
  goals: string[];
  techSavviness: number | null;
  spendingCapacity: number | null;
  description: string;
}

interface MarketAnalysisData {
  targetAudience: string;
  marketSize: string;
  competitionLevel: string;
  trendDirection: string;
  keywords: string[];
}

interface SentimentData {
  positive: number | null;
  neutral: number | null;
  negative: number | null;
  topPositive: string[];
  topNegative: string[];
}

interface XiaohongshuData {
  totalNotes: number;
  totalEngagement: number;
  avgLikes: number;
  avgComments: number;
  avgCollects: number;
}

interface AIAnalysisData {
  feasibilityScore: number | null;
  analysisStatus?: string;
  decision?: string;
  evidenceAssessment?: { support: Array<{ claim: string; evidenceIds: string[] }>; counter: Array<{ claim: string; evidenceIds: string[] }>; unknowns: string[]; nextExperiment: string };
  overallVerdict: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  risks: string[];
}

export interface ReportData {
  id: string;
  idea: string;
  score: number | null;
  verdict: string;
  tags: string[];
  createdAt: string;
  dimensions: DimensionData[];
  persona: PersonaData | null;
  marketAnalysis: MarketAnalysisData;
  sentiment: SentimentData;
  xiaohongshu: XiaohongshuData;
  aiAnalysis: AIAnalysisData;
  proofResult?: { sampleUv: number; paidIntentRate: number | null; waitlistRate: number | null; verdict: string };
  evidenceItems?: Array<{ id?: string; title: string; snippet: string; url?: string }>;
}

function getScoreColor(score: number | null): string {
  if (score === null) return '#6b7280';
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

export function getReportResearchLabel(data: ReportData): string {
  const status = data.aiAnalysis.analysisStatus;
  if (status === 'incomplete') return '分析未完成';
  if (status !== 'complete') return '旧版研究判断';
  return ({ test: '值得小测', reframe: '需要调整', pause: '暂缓', insufficient: '证据不足' } as Record<string, string>)[data.aiAnalysis.decision || ''] || '证据不足';
}

export function prepareResearchExport(data: ReportData): ReportData {
  const incomplete = data.aiAnalysis.analysisStatus === 'incomplete';
  const noScore = incomplete || data.aiAnalysis.analysisStatus === 'complete' && data.aiAnalysis.decision === 'insufficient';
  return {
    ...data,
    score: !noScore && typeof data.score === 'number' && Number.isFinite(data.score) ? data.score : null,
    dimensions: incomplete ? [] : data.dimensions.filter(d => typeof d.score === 'number' && Number.isFinite(d.score)),
    sentiment: incomplete ? { ...data.sentiment, positive: null, neutral: null, negative: null } : data.sentiment,
  };
}

export function generateResearchSummaryHTML(data: ReportData): string {
  const assessment = data.aiAnalysis.evidenceAssessment;
  const statements = (items: Array<{ claim: string; evidenceIds: string[] }> = []) => items.map(item => `<li>${escapeHtml(item.claim)} <small>${escapeHtml(item.evidenceIds.join(', '))}</small></li>`).join('');
  const proof = data.proofResult;
  const proofText = proof && proof.sampleUv > 0 && proof.paidIntentRate !== null ? `已记录 ${proof.sampleUv} 个访问样本，付费意图 ${Math.round(proof.paidIntentRate * 100)}%；意图行为不等于实际购买。` : '尚未实验，尚未取得行为转化数据。';
  const sources = (data.evidenceItems || []).map(item => {
    let href = '';
    try { const url = new URL(item.url || ''); if (url.protocol === 'https:' && !url.username && !url.password) href = url.href; } catch { /* 没有安全链接时仍保留原文 */ }
    return `<li>${escapeHtml(item.title)}${item.id ? ` (${escapeHtml(item.id)})` : ''}<blockquote>${escapeHtml(item.snippet)}</blockquote>${href ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">查看来源</a>` : ''}</li>`;
  }).join('');
  return `<section class="section"><h2>研究判断与下一步</h2><p>${escapeHtml(getReportResearchLabel(data))}。研究参考分不能证明需求或真实付款。</p><p>${escapeHtml(proofText)}</p>${assessment ? `<h3>支持证据</h3><ul>${statements(assessment.support)}</ul><h3>反证</h3><ul>${statements(assessment.counter)}</ul><h3>待核实</h3><ul>${assessment.unknowns.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul><p>下一步实验：${escapeHtml(assessment.nextExperiment || '尚未指定')}</p>` : '<p>尚未提供可追溯的支持、反证和实验方案。</p>'}${sources ? `<h3>原文记录</h3><ul>${sources}</ul>` : ''}</section>`;
}

function generateRadarSVG(dimensions: DimensionData[]): string {
  const cx = 150;
  const cy = 150;
  const maxRadius = 100;
  const n = dimensions.length;
  if (!n) return "<p>尚未取得维度评分</p>";
  
  // Generate grid lines
  let gridLines = "";
  for (let level = 1; level <= 4; level++) {
    const r = (maxRadius * level) / 4;
    let points = "";
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points += `${x},${y} `;
    }
    gridLines += `<polygon points="${points.trim()}" fill="none" stroke="#374151" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>`;
  }
  
  // Generate axis lines
  let axisLines = "";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + maxRadius * Math.cos(angle);
    const y = cy + maxRadius * Math.sin(angle);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#374151" stroke-width="1" opacity="0.3"/>`;
  }
  
  // Generate labels
  let labels = "";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const labelRadius = maxRadius + 25;
    const x = cx + labelRadius * Math.cos(angle);
    const y = cy + labelRadius * Math.sin(angle);
    const dim = dimensions[i];
    labels += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#9ca3af" font-size="11">${escapeHtml(dim.dimension)}</text>`;
  }
  
  // Generate data polygon
  let dataPoints = "";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (maxRadius * dimensions[i].score) / 100;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    dataPoints += `${x},${y} `;
  }
  
  return `
    <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${axisLines}
      <polygon points="${dataPoints.trim()}" fill="rgba(139, 92, 246, 0.2)" stroke="#8b5cf6" stroke-width="2.5"/>
      ${labels}
    </svg>
  `;
}

function generateSentimentBar(sentiment: SentimentData): string {
  if ([sentiment.positive, sentiment.neutral, sentiment.negative].some(v => v === null || !Number.isFinite(v)) || sentiment.positive + sentiment.neutral + sentiment.negative <= 0) return '<p>尚未取得情感分类数据</p>';
  const total = sentiment.positive + sentiment.neutral + sentiment.negative;
  const posPercent = Math.round((sentiment.positive / total) * 100);
  const neuPercent = Math.round((sentiment.neutral / total) * 100);
  const negPercent = Math.round((sentiment.negative / total) * 100);
  
  return `
    <div style="display: flex; height: 24px; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
      <div style="width: ${posPercent}%; background: linear-gradient(90deg, #22c55e, #16a34a); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">${posPercent}%</div>
      <div style="width: ${neuPercent}%; background: linear-gradient(90deg, #6b7280, #4b5563); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">${neuPercent}%</div>
      <div style="width: ${negPercent}%; background: linear-gradient(90deg, #ef4444, #dc2626); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">${negPercent}%</div>
    </div>
    <div style="display: flex; justify-content: space-around; font-size: 12px; color: #9ca3af;">
      <span>✅ 正面 ${posPercent}%</span>
      <span>⚖️ 中性 ${neuPercent}%</span>
      <span>❌ 负面 ${negPercent}%</span>
    </div>
  `;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateReportHTML(data: ReportData): string {
  data = prepareResearchExport(data);
  const scoreColor = getScoreColor(data.score);
  const scoreLabel = getReportResearchLabel(data);
  const scoreEmoji = '';
  
  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      color: #e5e5e5;
      line-height: 1.6;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding: 40px;
      background: rgba(255,255,255,0.03);
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #8b5cf6, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 16px;
    }
    .tag {
      background: rgba(139, 92, 246, 0.15);
      color: #a78bfa;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      border: 1px solid rgba(139, 92, 246, 0.3);
    }
    .meta {
      font-size: 13px;
      color: #6b7280;
    }
    .score-section {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    @media (max-width: 768px) {
      .score-section { grid-template-columns: 1fr; }
    }
    .score-card {
      background: rgba(255,255,255,0.03);
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      padding: 32px;
      text-align: center;
    }
    .score-value {
      font-size: 72px;
      font-weight: 800;
      color: ${scoreColor};
      line-height: 1;
    }
    .score-label {
      display: inline-block;
      margin-top: 16px;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      background: ${scoreColor}20;
      color: ${scoreColor};
      border: 1px solid ${scoreColor}40;
    }
    .radar-card {
      background: rgba(255,255,255,0.03);
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      padding: 24px;
    }
    .radar-card h3 {
      font-size: 16px;
      margin-bottom: 16px;
      color: #a78bfa;
    }
    .section {
      background: rgba(255,255,255,0.03);
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      padding: 28px;
      margin-bottom: 24px;
    }
    .section h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #f3f4f6;
    }
    .section h2::before {
      content: "";
      width: 4px;
      height: 20px;
      background: linear-gradient(135deg, #8b5cf6, #a78bfa);
      border-radius: 2px;
    }
    .dimension-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }
    .dimension-item {
      background: rgba(255,255,255,0.02);
      border-radius: 12px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .dimension-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .dimension-name {
      font-weight: 600;
      font-size: 14px;
    }
    .dimension-score {
      font-weight: 700;
      font-size: 18px;
    }
    .dimension-bar {
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .dimension-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }
    .dimension-reason {
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.5;
    }
    .persona-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 768px) {
      .persona-grid { grid-template-columns: 1fr; }
    }
    .persona-info {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .persona-name {
      font-size: 20px;
      font-weight: 700;
      color: #8b5cf6;
    }
    .persona-role {
      font-size: 14px;
      color: #9ca3af;
    }
    .persona-detail {
      font-size: 13px;
      color: #d1d5db;
    }
    .list-section {
      margin-top: 16px;
    }
    .list-section h4 {
      font-size: 13px;
      color: #8b5cf6;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .list-section ul {
      list-style: none;
      padding: 0;
    }
    .list-section li {
      font-size: 13px;
      color: #d1d5db;
      padding: 6px 0;
      padding-left: 16px;
      position: relative;
    }
    .list-section li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #8b5cf6;
    }
    .progress-item {
      margin-bottom: 12px;
    }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .progress-bar {
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #8b5cf6, #a78bfa);
      border-radius: 3px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-item {
      text-align: center;
      padding: 16px;
      background: rgba(255,255,255,0.02);
      border-radius: 12px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #8b5cf6;
    }
    .stat-label {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .ai-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 768px) {
      .ai-list { grid-template-columns: 1fr; }
    }
    .ai-list-section h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .strength { color: #22c55e; }
    .weakness { color: #ef4444; }
    .suggestion { color: #3b82f6; }
    .risk { color: #f59e0b; }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      font-size: 12px;
      color: #6b7280;
    }
    .verdict-text {
      font-size: 14px;
      color: #d1d5db;
      background: rgba(255,255,255,0.02);
      padding: 16px;
      border-radius: 12px;
      margin-top: 16px;
      line-height: 1.7;
    }
  `;
  
  const dimensionsHTML = data.dimensions.map(d => {
    const color = getScoreColor(d.score);
    return `
      <div class="dimension-item">
        <div class="dimension-header">
          <span class="dimension-name">${escapeHtml(d.dimension)}</span>
          <span class="dimension-score" style="color: ${color}">${d.score}</span>
        </div>
        <div class="dimension-bar">
          <div class="dimension-bar-fill" style="width: ${d.score}%; background: ${color}"></div>
        </div>
        <div class="dimension-reason">${escapeHtml(d.reason)}</div>
      </div>
    `;
  }).join("");
  
  const personaHTML = data.persona ? `
    <section class="section">
      <h2>👤 用户画像</h2>
      <div class="persona-grid">
        <div class="persona-info">
          <div class="persona-name">${escapeHtml(data.persona.name)}</div>
          <div class="persona-role">${escapeHtml(data.persona.role)}</div>
          <div class="persona-detail">📅 年龄: ${escapeHtml(data.persona.age)}</div>
          <div class="persona-detail">💰 收入: ${escapeHtml(data.persona.income)}</div>
          <div class="persona-detail" style="margin-top: 12px; color: #9ca3af;">${escapeHtml(data.persona.description)}</div>
          
          <div class="list-section">
            <h4>😣 核心痛点</h4>
            <ul>
              ${escapeHtmlArray(data.persona.painPoints).map(p => `<li>${p}</li>`).join("")}
            </ul>
          </div>
          
          <div class="list-section">
            <h4>🎯 核心目标</h4>
            <ul>
              ${escapeHtmlArray(data.persona.goals).map(g => `<li>${g}</li>`).join("")}
            </ul>
          </div>
        </div>
        
        <div>
          <div class="progress-item">
            <div class="progress-label">
              <span>技术素养</span>
              <span>${data.persona.techSavviness === null ? '未知' : `${data.persona.techSavviness}%`}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${data.persona.techSavviness ?? 0}%; display: ${data.persona.techSavviness === null ? 'none' : 'block'}"></div>
            </div>
          </div>
          <div class="progress-item">
            <div class="progress-label">
              <span>消费能力</span>
              <span>${data.persona.spendingCapacity === null ? '未知' : `${data.persona.spendingCapacity}%`}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${data.persona.spendingCapacity ?? 0}%; display: ${data.persona.spendingCapacity === null ? 'none' : 'block'}"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  ` : "";
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>需求验证报告 - ${escapeHtml(data.idea)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="tags">
        ${escapeHtmlArray(data.tags).map(tag => `<span class="tag">#${tag}</span>`).join("")}
      </div>
      <h1>${escapeHtml(data.idea)}</h1>
      <div class="meta">
        📅 ${formatDate(data.createdAt)} · 报告ID: ${escapeHtml(data.id.slice(0, 8))}
      </div>
    </header>
    
    <!-- Score Section -->
    <div class="score-section">
      <div class="score-card">
        <div class="score-value">${data.score === null ? '—' : data.score}</div>
        <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">${data.score === null ? '尚未评分' : '研究参考分 / 100'}</div>
        <div class="score-label">${scoreEmoji} ${scoreLabel}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 12px;">
          已采集 ${data.xiaohongshu.totalNotes} 条去重帖子
        </div>
      </div>
      
      <div class="radar-card">
        <h3>🎯 研究维度参考</h3>
        ${generateRadarSVG(data.dimensions)}
      </div>
    </div>
    
    ${generateResearchSummaryHTML(data)}

    <!-- Dimensions Detail -->
    <section class="section">
      <h2>📊 维度详细分析</h2>
      <div class="dimension-grid">
        ${dimensionsHTML}
      </div>
    </section>
    
    <!-- Persona -->
    ${personaHTML}
    
    <!-- Market Analysis -->
    <section class="section">
      <h2>📈 市场分析</h2>
      <div class="persona-grid">
        <div>
          <div class="persona-detail"><strong>🎯 目标用户:</strong> ${escapeHtml(data.marketAnalysis.targetAudience)}</div>
          <div class="persona-detail" style="margin-top: 12px;"><strong>📊 市场规模:</strong> ${escapeHtml(data.marketAnalysis.marketSize)}</div>
          <div class="persona-detail" style="margin-top: 12px;"><strong>⚔️ 竞争程度:</strong> ${escapeHtml(data.marketAnalysis.competitionLevel)}</div>
          <div class="persona-detail" style="margin-top: 12px;"><strong>📈 趋势方向:</strong> ${escapeHtml(data.marketAnalysis.trendDirection)}</div>
        </div>
        <div>
          <h4 style="font-size: 13px; color: #8b5cf6; margin-bottom: 8px;">🔑 关键词</h4>
          <div class="tags" style="justify-content: flex-start;">
            ${escapeHtmlArray(data.marketAnalysis.keywords).map(k => `<span class="tag">${k}</span>`).join("")}
          </div>
        </div>
      </div>
    </section>
    
    <!-- Sentiment Analysis -->
    <section class="section">
      <h2>💬 情感分析</h2>
      ${generateSentimentBar(data.sentiment)}
      
      <div class="ai-list" style="margin-top: 20px;">
        <div class="ai-list-section">
          <h4 class="strength">✅ 正面反馈</h4>
          <ul style="list-style: none; padding: 0;">
            ${data.sentiment.topPositive.length > 0 
              ? escapeHtmlArray(data.sentiment.topPositive).map(p => `<li style="font-size: 13px; color: #d1d5db; padding: 6px 0;">${p}</li>`).join("")
              : "<li style='font-size: 13px; color: #6b7280;'>暂无数据</li>"
            }
          </ul>
        </div>
        <div class="ai-list-section">
          <h4 class="weakness">❌ 负面反馈</h4>
          <ul style="list-style: none; padding: 0;">
            ${data.sentiment.topNegative.length > 0 
              ? escapeHtmlArray(data.sentiment.topNegative).map(n => `<li style="font-size: 13px; color: #d1d5db; padding: 6px 0;">${n}</li>`).join("")
              : "<li style='font-size: 13px; color: #6b7280;'>暂无数据</li>"
            }
          </ul>
        </div>
      </div>
    </section>
    
    <!-- Xiaohongshu Stats -->
    <section class="section">
      <h2>📱 社媒采样数据</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${data.xiaohongshu.totalNotes.toLocaleString()}</div>
          <div class="stat-label">去重帖子</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${data.xiaohongshu.totalEngagement.toLocaleString()}</div>
          <div class="stat-label">总互动量</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${data.xiaohongshu.avgLikes}</div>
          <div class="stat-label">平均点赞</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${data.xiaohongshu.avgComments}</div>
          <div class="stat-label">平均评论</div>
        </div>
      </div>
    </section>
    
    <!-- AI Deep Analysis -->
    <section class="section">
      <h2>🧠 AI 深度分析</h2>
      <div class="verdict-text">${escapeHtml(data.aiAnalysis.overallVerdict)}</div>
      
      <div class="ai-list" style="margin-top: 24px;">
        <div class="ai-list-section">
          <h4 class="strength">💪 优势</h4>
          <ul style="list-style: none; padding: 0;">
            ${data.aiAnalysis.strengths.length > 0 
              ? escapeHtmlArray(data.aiAnalysis.strengths).map(s => `<li style="font-size: 13px; color: #d1d5db; padding: 6px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #22c55e;">•</span>${s}</li>`).join("")
              : "<li style='font-size: 13px; color: #6b7280;'>暂无数据</li>"
            }
          </ul>
        </div>
        <div class="ai-list-section">
          <h4 class="weakness">⚠️ 劣势</h4>
          <ul style="list-style: none; padding: 0;">
            ${data.aiAnalysis.weaknesses.length > 0 
              ? escapeHtmlArray(data.aiAnalysis.weaknesses).map(w => `<li style="font-size: 13px; color: #d1d5db; padding: 6px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #ef4444;">•</span>${w}</li>`).join("")
              : "<li style='font-size: 13px; color: #6b7280;'>暂无数据</li>"
            }
          </ul>
        </div>
        <div class="ai-list-section">
          <h4 class="suggestion">💡 建议</h4>
          <ul style="list-style: none; padding: 0;">
            ${data.aiAnalysis.suggestions.length > 0 
              ? escapeHtmlArray(data.aiAnalysis.suggestions).map(s => `<li style="font-size: 13px; color: #d1d5db; padding: 6px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #3b82f6;">•</span>${s}</li>`).join("")
              : "<li style='font-size: 13px; color: #6b7280;'>暂无数据</li>"
            }
          </ul>
        </div>
        <div class="ai-list-section">
          <h4 class="risk">⚡ 风险</h4>
          <ul style="list-style: none; padding: 0;">
            ${data.aiAnalysis.risks.length > 0 
              ? escapeHtmlArray(data.aiAnalysis.risks).map(r => `<li style="font-size: 13px; color: #d1d5db; padding: 6px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #f59e0b;">•</span>${r}</li>`).join("")
              : "<li style='font-size: 13px; color: #6b7280;'>暂无数据</li>"
            }
          </ul>
        </div>
      </div>
    </section>
    
    <!-- Footer -->
    <footer class="footer">
      <p>需求验证报告 · 由 AI 驱动分析生成</p>
      <p style="margin-top: 8px;">© ${new Date().getFullYear()} Idea Validate</p>
    </footer>
  </div>
</body>
</html>`;
}

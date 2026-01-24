// PDF Report Generator
// Generates print-optimized HTML for multi-page PDF export

import { ReportData } from "./reportGenerator";
import { escapeHtml, escapeHtmlArray } from "./htmlEscape";

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "真实刚需";
  if (score >= 60) return "需求待验证";
  return "疑似伪需求";
}

function getScoreEmoji(score: number): string {
  if (score >= 80) return "✅";
  if (score >= 60) return "⚠️";
  return "❌";
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

function generateRadarSVG(dimensions: { dimension: string; score: number }[]): string {
  const cx = 120;
  const cy = 120;
  const maxRadius = 80;
  const n = dimensions.length;
  
  if (n === 0) return "";
  
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
    gridLines += `<polygon points="${points.trim()}" fill="none" stroke="#d1d5db" stroke-width="0.5"/>`;
  }
  
  let axisLines = "";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + maxRadius * Math.cos(angle);
    const y = cy + maxRadius * Math.sin(angle);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#d1d5db" stroke-width="0.5"/>`;
  }
  
  let labels = "";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const labelRadius = maxRadius + 20;
    const x = cx + labelRadius * Math.cos(angle);
    const y = cy + labelRadius * Math.sin(angle);
    const dim = dimensions[i];
    labels += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#374151" font-size="9" font-weight="500">${escapeHtml(dim.dimension)}</text>`;
  }
  
  let dataPoints = "";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (maxRadius * dimensions[i].score) / 100;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    dataPoints += `${x},${y} `;
  }
  
  return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" style="width: 100%; max-width: 240px;">
    ${gridLines}
    ${axisLines}
    <polygon points="${dataPoints.trim()}" fill="rgba(124, 58, 237, 0.15)" stroke="#7c3aed" stroke-width="2"/>
    ${labels}
  </svg>`;
}

export function generatePDFHTML(data: ReportData): string {
  const scoreColor = getScoreColor(data.score);
  const scoreLabel = getScoreLabel(data.score);
  const scoreEmoji = getScoreEmoji(data.score);
  
  const styles = `
    @page {
      size: A4;
      margin: 15mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }
    .page {
      page-break-after: always;
      padding: 10px 0;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #7c3aed;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #7c3aed;
      margin-bottom: 8px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-bottom: 10px;
    }
    .tag {
      background: #f3e8ff;
      color: #7c3aed;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
    }
    .meta {
      font-size: 10px;
      color: #6b7280;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::before {
      content: "";
      width: 4px;
      height: 16px;
      background: #7c3aed;
      border-radius: 2px;
    }
    .score-grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .score-card {
      text-align: center;
      padding: 20px;
      background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
      border-radius: 12px;
      border: 1px solid #e9d5ff;
    }
    .score-value {
      font-size: 48px;
      font-weight: 800;
      color: ${scoreColor};
      line-height: 1;
    }
    .score-label {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: ${scoreColor}20;
      color: ${scoreColor};
    }
    .score-meta {
      font-size: 9px;
      color: #6b7280;
      margin-top: 8px;
    }
    .radar-card {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
      border-radius: 12px;
      padding: 10px;
    }
    .dimension-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .dimension-item {
      background: #f9fafb;
      border-radius: 8px;
      padding: 10px;
      border: 1px solid #e5e7eb;
    }
    .dimension-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .dimension-name {
      font-weight: 600;
      font-size: 11px;
      color: #374151;
    }
    .dimension-score {
      font-weight: 700;
      font-size: 14px;
    }
    .dimension-bar {
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .dimension-bar-fill {
      height: 100%;
      border-radius: 2px;
    }
    .dimension-reason {
      font-size: 9px;
      color: #6b7280;
      line-height: 1.4;
    }
    .persona-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .persona-box {
      background: #f9fafb;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #e5e7eb;
    }
    .persona-name {
      font-size: 16px;
      font-weight: 700;
      color: #7c3aed;
      margin-bottom: 4px;
    }
    .persona-role {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .persona-detail {
      font-size: 10px;
      color: #374151;
      margin-bottom: 4px;
    }
    .list-title {
      font-size: 10px;
      font-weight: 600;
      color: #7c3aed;
      margin-top: 10px;
      margin-bottom: 6px;
    }
    .list-item {
      font-size: 10px;
      color: #374151;
      padding: 3px 0;
      padding-left: 12px;
      position: relative;
    }
    .list-item::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #7c3aed;
    }
    .progress-item {
      margin-bottom: 8px;
    }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      margin-bottom: 2px;
      color: #6b7280;
    }
    .progress-bar {
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #7c3aed, #a78bfa);
      border-radius: 2px;
    }
    .market-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .market-item {
      background: #f9fafb;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .market-label {
      font-size: 9px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .market-value {
      font-size: 11px;
      font-weight: 600;
      color: #1f2937;
    }
    .sentiment-bar {
      display: flex;
      height: 20px;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 10px;
    }
    .sentiment-positive {
      background: linear-gradient(90deg, #22c55e, #16a34a);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 9px;
      font-weight: 600;
    }
    .sentiment-neutral {
      background: linear-gradient(90deg, #6b7280, #4b5563);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 9px;
      font-weight: 600;
    }
    .sentiment-negative {
      background: linear-gradient(90deg, #ef4444, #dc2626);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 9px;
      font-weight: 600;
    }
    .sentiment-legend {
      display: flex;
      justify-content: space-around;
      font-size: 9px;
      color: #6b7280;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .stat-item {
      text-align: center;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 700;
      color: #7c3aed;
    }
    .stat-label {
      font-size: 9px;
      color: #6b7280;
      margin-top: 2px;
    }
    .ai-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .ai-box {
      background: #f9fafb;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #e5e7eb;
    }
    .ai-box-title {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
    }
    .ai-box-title.strength { color: #22c55e; }
    .ai-box-title.weakness { color: #ef4444; }
    .ai-box-title.suggestion { color: #3b82f6; }
    .ai-box-title.risk { color: #f59e0b; }
    .verdict-box {
      background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #e9d5ff;
      margin-bottom: 16px;
    }
    .verdict-text {
      font-size: 11px;
      color: #374151;
      line-height: 1.6;
    }
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      margin-top: 20px;
      font-size: 9px;
      color: #9ca3af;
    }
  `;

  const sentimentTotal = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative;
  const posPercent = Math.round((data.sentiment.positive / sentimentTotal) * 100);
  const neuPercent = Math.round((data.sentiment.neutral / sentimentTotal) * 100);
  const negPercent = Math.round((data.sentiment.negative / sentimentTotal) * 100);

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
    <div class="section">
      <h2 class="section-title">👤 用户画像</h2>
      <div class="persona-grid">
        <div class="persona-box">
          <div class="persona-name">${escapeHtml(data.persona.name)}</div>
          <div class="persona-role">${escapeHtml(data.persona.role)}</div>
          <div class="persona-detail">📅 年龄: ${escapeHtml(data.persona.age)}</div>
          <div class="persona-detail">💰 收入: ${escapeHtml(data.persona.income)}</div>
          <div style="font-size: 9px; color: #6b7280; margin-top: 8px;">${escapeHtml(data.persona.description)}</div>
          
          <div class="list-title">😣 核心痛点</div>
          ${escapeHtmlArray(data.persona.painPoints).map(p => `<div class="list-item">${p}</div>`).join("")}
          
          <div class="list-title">🎯 核心目标</div>
          ${escapeHtmlArray(data.persona.goals).map(g => `<div class="list-item">${g}</div>`).join("")}
        </div>
        
        <div class="persona-box">
          <div class="list-title" style="margin-top: 0;">属性指标</div>
          <div class="progress-item">
            <div class="progress-label">
              <span>技术素养</span>
              <span>${data.persona.techSavviness}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${data.persona.techSavviness}%"></div>
            </div>
          </div>
          <div class="progress-item">
            <div class="progress-label">
              <span>消费能力</span>
              <span>${data.persona.spendingCapacity}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${data.persona.spendingCapacity}%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  <!-- Page 1: Overview & Score -->
  <div class="page">
    <header class="header">
      <div class="tags">
        ${escapeHtmlArray(data.tags).map(tag => `<span class="tag">#${tag}</span>`).join("")}
      </div>
      <h1>${escapeHtml(data.idea)}</h1>
      <div class="meta">
        📅 ${formatDate(data.createdAt)} · 报告ID: ${escapeHtml(data.id.slice(0, 8))}
      </div>
    </header>
    
    <div class="score-grid">
      <div class="score-card">
        <div class="score-value">${data.score}</div>
        <div style="color: #6b7280; font-size: 12px;">/ 100</div>
        <div class="score-label">${scoreEmoji} ${scoreLabel}</div>
        <div class="score-meta">基于 ${data.xiaohongshu.totalNotes.toLocaleString()} 条数据</div>
      </div>
      <div class="radar-card">
        ${generateRadarSVG(data.dimensions)}
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title">📊 维度详细分析</h2>
      <div class="dimension-grid">
        ${dimensionsHTML}
      </div>
    </div>
  </div>
  
  <!-- Page 2: Persona & Market -->
  <div class="page">
    ${personaHTML}
    
    <div class="section">
      <h2 class="section-title">📈 市场分析</h2>
      <div class="market-grid">
        <div class="market-item">
          <div class="market-label">🎯 目标用户</div>
          <div class="market-value">${escapeHtml(data.marketAnalysis.targetAudience)}</div>
        </div>
        <div class="market-item">
          <div class="market-label">📊 市场规模</div>
          <div class="market-value">${escapeHtml(data.marketAnalysis.marketSize)}</div>
        </div>
        <div class="market-item">
          <div class="market-label">⚔️ 竞争程度</div>
          <div class="market-value">${escapeHtml(data.marketAnalysis.competitionLevel)}</div>
        </div>
        <div class="market-item">
          <div class="market-label">📈 趋势方向</div>
          <div class="market-value">${escapeHtml(data.marketAnalysis.trendDirection)}</div>
        </div>
      </div>
      ${data.marketAnalysis.keywords.length > 0 ? `
        <div style="margin-top: 12px;">
          <div class="list-title">🔑 关键词</div>
          <div class="tags" style="justify-content: flex-start;">
            ${escapeHtmlArray(data.marketAnalysis.keywords).map(k => `<span class="tag">${k}</span>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
    
    <div class="section">
      <h2 class="section-title">💬 情感分析</h2>
      <div class="sentiment-bar">
        <div class="sentiment-positive" style="width: ${posPercent}%">${posPercent}%</div>
        <div class="sentiment-neutral" style="width: ${neuPercent}%">${neuPercent}%</div>
        <div class="sentiment-negative" style="width: ${negPercent}%">${negPercent}%</div>
      </div>
      <div class="sentiment-legend">
        <span>✅ 正面 ${posPercent}%</span>
        <span>⚖️ 中性 ${neuPercent}%</span>
        <span>❌ 负面 ${negPercent}%</span>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
        <div class="persona-box">
          <div class="list-title" style="margin-top: 0; color: #22c55e;">✅ 正面反馈</div>
          ${data.sentiment.topPositive.length > 0 
            ? escapeHtmlArray(data.sentiment.topPositive.slice(0, 3)).map(p => `<div class="list-item">${p}</div>`).join("")
            : '<div style="font-size: 9px; color: #9ca3af;">暂无数据</div>'
          }
        </div>
        <div class="persona-box">
          <div class="list-title" style="margin-top: 0; color: #ef4444;">❌ 负面反馈</div>
          ${data.sentiment.topNegative.length > 0 
            ? escapeHtmlArray(data.sentiment.topNegative.slice(0, 3)).map(n => `<div class="list-item">${n}</div>`).join("")
            : '<div style="font-size: 9px; color: #9ca3af;">暂无数据</div>'
          }
        </div>
      </div>
    </div>
  </div>
  
  <!-- Page 3: Data & AI Analysis -->
  <div class="page">
    <div class="section">
      <h2 class="section-title">📱 小红书数据</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${data.xiaohongshu.totalNotes.toLocaleString()}</div>
          <div class="stat-label">相关笔记</div>
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
    </div>
    
    <div class="section">
      <h2 class="section-title">🧠 AI 深度分析</h2>
      <div class="verdict-box">
        <div class="verdict-text">${escapeHtml(data.aiAnalysis.overallVerdict)}</div>
      </div>
      
      <div class="ai-grid">
        <div class="ai-box">
          <div class="ai-box-title strength">💪 优势</div>
          ${data.aiAnalysis.strengths.length > 0 
            ? escapeHtmlArray(data.aiAnalysis.strengths).map(s => `<div class="list-item">${s}</div>`).join("")
            : '<div style="font-size: 9px; color: #9ca3af;">暂无数据</div>'
          }
        </div>
        <div class="ai-box">
          <div class="ai-box-title weakness">⚠️ 劣势</div>
          ${data.aiAnalysis.weaknesses.length > 0 
            ? escapeHtmlArray(data.aiAnalysis.weaknesses).map(w => `<div class="list-item">${w}</div>`).join("")
            : '<div style="font-size: 9px; color: #9ca3af;">暂无数据</div>'
          }
        </div>
        <div class="ai-box">
          <div class="ai-box-title suggestion">💡 建议</div>
          ${data.aiAnalysis.suggestions.length > 0 
            ? escapeHtmlArray(data.aiAnalysis.suggestions).map(s => `<div class="list-item">${s}</div>`).join("")
            : '<div style="font-size: 9px; color: #9ca3af;">暂无数据</div>'
          }
        </div>
        <div class="ai-box">
          <div class="ai-box-title risk">⚡ 风险</div>
          ${data.aiAnalysis.risks.length > 0 
            ? escapeHtmlArray(data.aiAnalysis.risks).map(r => `<div class="list-item">${r}</div>`).join("")
            : '<div style="font-size: 9px; color: #9ca3af;">暂无数据</div>'
          }
        </div>
      </div>
    </div>
    
    <footer class="footer">
      <p>需求验证报告 · 由 AI 驱动分析生成</p>
      <p style="margin-top: 4px;">© ${new Date().getFullYear()} Idea Validate</p>
    </footer>
  </div>
</body>
</html>`;
}

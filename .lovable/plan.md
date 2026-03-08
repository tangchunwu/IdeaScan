

# PDF 导出布局优化 + 体积压缩

## 当前问题

1. **内容被裁剪**：每个 `.page` 整体截图后，如果内容超出 A4 高度，`Math.min(imgHeight, pdfHeight - margin*2)` 直接把超出部分丢掉了
2. **体积大**：scale: 2 + PNG 无压缩

## 方案：自动分片 + JPEG 压缩

不改 `pdfGenerator.ts` 的 HTML 模板，只改 `src/lib/export.ts` 的 `exportToMultiPagePdf` 函数：

### 核心逻辑改动

**去掉按 `.page` 分页的方式**，改为：
1. 把整个 HTML 渲染到隐藏容器
2. 对整个容器做一次 `html2canvas` 截图
3. 按 A4 高度**自动切片**：每页从大图中裁剪一个 A4 高度的区域写入 PDF
4. 用 JPEG 0.75 压缩 + scale 1.5

```typescript
// 伪代码
const fullCanvas = await html2canvas(container, { scale: 1.5 });
const pageHeightPx = (pdfHeight - margin*2) / contentWidth * fullCanvas.width;
const totalPages = Math.ceil(fullCanvas.height / pageHeightPx);

for (let i = 0; i < totalPages; i++) {
  // 从大图中裁剪当前页区域
  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = fullCanvas.width;
  sliceCanvas.height = Math.min(pageHeightPx, fullCanvas.height - i * pageHeightPx);
  const ctx = sliceCanvas.getContext('2d');
  ctx.drawImage(fullCanvas, 0, -i * pageHeightPx);
  
  const imgData = sliceCanvas.toDataURL("image/jpeg", 0.75);
  if (i > 0) pdf.addPage();
  pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, sliceHeight_mm);
}
```

### 效果

- **布局完全保持** — 和 HTML 看到的一模一样，不会裁剪任何内容
- **体积减小 60-70%** — JPEG 压缩 + 降 scale
- **自动分页** — 内容多长都能完整导出，不依赖 `.page` class

### 改动文件

仅 `src/lib/export.ts` 中的 `exportToMultiPagePdf` 函数，约 30 行代码重写。


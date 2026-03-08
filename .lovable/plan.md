

# 修复 PDF 模糊问题

## 原因

`scale: 1.5` + `JPEG quality: 0.75` 双重降质导致太糊。

## 方案

把 `scale` 提回 **2**，JPEG quality 提到 **0.85**。这样清晰度接近原版，但因为用 JPEG 而非 PNG，体积仍然比之前小 **40-50%**。

### 改动：`src/lib/export.ts`，仅改 2 个数字

- 第 54 行：`scale: 1.5` → `scale: 2`
- 第 93 行：`toDataURL("image/jpeg", 0.75)` → `toDataURL("image/jpeg", 0.85)`


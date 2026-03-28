

## AI 润色需求描述功能

用户在验证页输入简短的想法描述后，点击"AI 润色"按钮，系统调用 LLM 将短描述扩写为更具体、更结构化的描述（包含目标用户、核心卖点、使用场景等），用户可选择采纳或放弃。

---

### 1. 新建 Edge Function `polish-idea` (`supabase/functions/polish-idea/index.ts`)
- 接收 `{ idea: string }` 参数
- 使用 Lovable AI Gateway (`LOVABLE_API_KEY` + `google/gemini-3-flash-preview`)
- System prompt 引导模型将短描述扩写为 80-150 字的具体描述，包含：目标用户群体、核心痛点/卖点、使用场景
- 返回 `{ polished: string }`
- 加身份验证（resolveAuthUserOrBypass）

### 2. 修改 `src/pages/Validate.tsx`
- 在 textarea 下方、提示文字旁边，添加"✨ AI 润色"按钮
  - 条件：`idea.trim().length >= 5 && !stream.isValidating`
  - 点击后调用 `polish-idea` edge function
  - Loading 状态显示 `<Loader2>` 旋转动画
- 收到结果后，显示一个小预览区域（diff 风格），包含：
  - 润色后的文字
  - "采纳" 按钮（替换 textarea 内容）和"放弃"按钮（关闭预览）
- 状态管理：`isPolishing`、`polishedResult`

### 涉及文件
1. `supabase/functions/polish-idea/index.ts` — 新建 edge function
2. `src/pages/Validate.tsx` — 添加按钮 + 预览 UI


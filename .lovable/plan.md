
目标：把你现在“创投圈”这块一次性修到可用、稳定、可解释（不再出现 4 条一模一样占位评论、角色标签错乱、以及自定义模型失败时体验崩坏）。

一、我已经定位到的根因（基于当前线上数据与日志）
1) 自定义模型实际调用失败  
- 你的请求里发的是：
  - llmBaseUrl: https://kfc-api.sxxe.net/v1
  - llmModel: cursor2-claude-4.1-opus
- 后端日志明确返回 `model_not_found`（该网关分组下无此模型渠道）。

2) 失败后的降级逻辑不合理  
- `generate-discussion` 里当前是：单个 persona 调用失败后直接写入固定文案  
  `“我需要更多信息才能评价这个想法。”`
- 所以会出现 4 个专家都说同一句话（你截图就是这个结果）。

3) 角色展示映射写死了错误假设  
- 前端 `FeedItem` / `PersonaAvatar` 按 `vc/pm/user/analyst` 这种短码判断。
- 但数据库里的 persona.role 实际是中文描述（如“顶级 VC 合伙人”“资深产品经理”）。
- 结果 UI 把所有人都落到默认“分析师”样式，导致标签/配色不对。

4) 额外可改进问题  
- 后端响应里带回了 persona 全量字段（包含 `system_prompt`），有泄露风险和冗余 payload。  
- `generate-discussion` 对 validation 所有权校验不够严（应绑定当前用户）。

---

二、修复与完善方案（实施后你会直接感知到的效果）
1) 自定义模型失败时，自动切换到内置安全模型继续生成  
- 不再产出 4 条占位句；优先保证“有内容、可讨论”。
- 前端给出明确提示：已从自定义配置自动回退到内置模型。

2) 若所有模型都失败，明确报错，不写垃圾评论  
- 直接返回清晰错误信息（如模型不存在/网关不可达），引导用户去设置里修正。
- 避免“看起来成功但内容全是假降级”的误导。

3) 角色展示完全修正  
- 红杉老徐 / 产品阿强 / 毒舌可可 / 行业老王将显示正确标签、颜色和 emoji。
- 不再全部显示“分析师”。

4) 安全与数据整洁增强  
- 后端响应不再返回 `system_prompt`。
- 补齐 validation ownership 校验，防止越权生成评论。

---

三、具体改动清单（按文件）
A. supabase/functions/generate-discussion/index.ts
- 引入并使用 `_shared/llm-client.ts` 的 `requestChatCompletion`（替代手写单 endpoint fetch）。
- 增加“候选模型链路”：
  1. 用户当前自定义配置（若有）
  2. （可选）用户配置的 fallback 列表（llmFallbacks）
  3. 内置模型兜底（Lovable AI）
- 单 persona 生成策略改为“尝试链路直到成功”，并记录失败原因。
- 若 4 个 persona 全失败：返回明确错误（不入库占位评论）。
- 成功文本做清洗（去掉 `[名字]:` 前缀、空白规范化）。
- 仅返回安全 persona 字段（不含 system_prompt）。
- 增加 validation 与当前用户绑定校验。

B. supabase/functions/reply-to-comment/index.ts
- 与上面保持同样的 LLM 回退策略（避免“主讨论可用、回复不可用”的割裂）。
- 回复失败时返回清晰原因；成功时同样清洗输出。
- 返回 persona 安全字段，避免 system_prompt 外露。
- 补充对评论所属 validation 的用户权限校验。

C. src/services/socialService.ts
- 扩展 `LLMConfig`：支持 `llmFallbacks` 透传。
- `generateDiscussion` / `replyToComment` 返回结构支持 `meta`（如 `fallbackUsed`、`providerWarnings`）。
- 错误消息更可读（保留后端返回的具体诊断）。

D. src/components/social/VCFeed.tsx
- 传递 `llmFallbacks`（若已配置）。
- 处理 `meta.fallbackUsed`：给出友好 toast（例如“自定义模型不可用，已自动切换内置模型”）。
- 若后端返回“全部失败”，展示可执行提示（去设置验证 model/baseUrl/key）。

E. src/components/social/FeedItem.tsx + src/components/social/PersonaAvatar.tsx
- 新增“角色归一化”逻辑（根据 role 文本关键词与 persona 名字双重识别）。
- 正确映射 badge 文案、配色、emoji（VC/产品/用户/分析师）。

---

四、实施顺序（确保最少回归风险）
1) 先改后端生成与回复函数（稳定性与安全优先）。  
2) 再改前端服务层返回结构（兼容 meta）。  
3) 再改 VCFeed 提示交互。  
4) 最后修角色映射 UI。  
5) 做端到端联调与日志回归确认。

---

五、验收标准（你可直接验证）
1) 在“创投圈”点击生成讨论：  
- 不再出现 4 条相同占位句。  
- 若自定义模型不可用，会看到“已自动回退”的提示，但仍能生成正常讨论。

2) 角色显示正确：  
- 四个角色的标签不再全是“分析师”，颜色/emoji区分正常。

3) 回复链路可用：  
- 对 AI 评论回复后，AI 能继续回复（即使自定义模型有问题也有兜底）。

4) 后端行为正确：  
- 失败时不再写入占位垃圾评论。  
- 响应中不再包含 persona.system_prompt。  
- 权限校验通过（只能操作自己的验证数据）。

---

六、风险与处理
1) 风险：某些第三方网关返回格式不标准  
- 处理：统一走 `requestChatCompletion` 多 endpoint 兼容与错误归类。

2) 风险：fallback 链路过长导致响应慢  
- 处理：限制每次尝试超时和最大候选数量，优先内置兜底快速成功。

3) 风险：角色识别误判  
- 处理：优先按 persona.id/name 做稳定映射，role 关键词作为补充。

如果你确认，我下一步就按这个方案直接落地实现。
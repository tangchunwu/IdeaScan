

# 修复 Gallery 页面「暂无公开报告」问题

## 根因分析

所有对 `validations` 表的客户端查询都返回 **403** 错误，错误信息为 `"permission denied for table users"`。

**调用链**：
```text
validations SELECT
  → RLS: "Collaborators can view shared validations"
    → 子查询 report_collaborators
      → report_collaborators 自身的 RLS: "Collaborators can view their invites"
        → SELECT users.email FROM auth.users  ← 权限被拒
```

`report_collaborators` 的 RLS 策略直接查询 `auth.users` 表获取当前用户 email，但 `authenticated` 角色没有 `auth.users` 的 SELECT 权限，导致整条链路失败。

## 修复方案

用 `auth.email()` 函数替代 `SELECT email FROM auth.users` 子查询。`auth.email()` 是 Supabase 内置的安全函数，可直接从 JWT 中提取用户 email，无需访问 `auth.users` 表。

### 数据库迁移

```sql
-- 删除旧策略
DROP POLICY "Collaborators can view their invites" ON public.report_collaborators;

-- 重建策略，用 auth.email() 替代 auth.users 子查询
CREATE POLICY "Collaborators can view their invites"
ON public.report_collaborators
FOR SELECT
TO authenticated
USING (
  collaborator_id = auth.uid()
  OR collaborator_email = auth.email()::text
);
```

| 改动 | 说明 |
|------|------|
| 数据库迁移 | 修复 `report_collaborators` 的 RLS 策略，消除对 `auth.users` 的非法引用 |

无前端代码改动。1 条 SQL 迁移即可修复 Gallery 及所有 validations 查询的 403 问题。


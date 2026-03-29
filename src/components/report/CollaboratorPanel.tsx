import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSkinToast } from "@/hooks/useSkinToast";
import { Users, UserPlus, Loader2, X, Mail } from "lucide-react";

interface Collaborator {
  id: string;
  collaborator_email: string;
  collaborator_id: string | null;
  permission: string;
  status: string;
  created_at: string;
}

interface CollaboratorPanelProps {
  validationId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CollaboratorPanel({ validationId }: CollaboratorPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const emailValid = useMemo(() => EMAIL_RE.test(email.trim()), [email]);

  useEffect(() => {
    if (!user) return;
    fetchCollaborators();
  }, [user, validationId]);

  const fetchCollaborators = async () => {
    try {
      const { data, error } = await supabase
        .from("report_collaborators" as any)
        .select("*")
        .eq("validation_id", validationId)
        .eq("owner_id", user!.id);
      if (error) throw error;
      setCollaborators((data as any[]) || []);
    } catch (e) {
      console.error("Fetch collaborators error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!user || !email.trim()) return;
    const trimmed = email.trim().toLowerCase();

    if (!EMAIL_RE.test(trimmed)) {
      skinToast.error("邮箱格式不正确");
      return;
    }
    
    if (trimmed === user.email) {
      skinToast.error("不能邀请自己");
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from("report_collaborators" as any)
        .insert({
          validation_id: validationId,
          owner_id: user.id,
          collaborator_email: trimmed,
          permission: "view",
          status: "pending",
        } as any);
      if (error) {
        if (error.code === "23505") {
          skinToast.error("该用户已被邀请");
        } else {
          throw error;
        }
      } else {
        skinToast.success(`邀请已发送: 已邀请 ${trimmed} 查看此报告`);
        setEmail("");
        fetchCollaborators();
      }
    } catch (e) {
      console.error("Add collaborator error:", e);
      skinToast.error("邀请失败");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const { error } = await supabase
        .from("report_collaborators" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      setCollaborators((prev) => prev.filter((c) => c.id !== id));
      skinToast.success("已移除协作者");
    } catch (e) {
      console.error("Remove collaborator error:", e);
    }
  };

  if (!user) return null;

  return (
    <GlassCard className="animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-primary" />
        <h4 className="font-semibold text-sm text-foreground">协作分享</h4>
        <Badge variant="secondary" className="text-[10px]">
          {collaborators.length} 人
        </Badge>
      </div>

      {/* Add collaborator */}
      <div className="space-y-1 mb-4">
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="输入协作者邮箱..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-sm rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && emailValid && handleAdd()}
          />
          <Button
            size="sm"
            className="rounded-xl shrink-0"
            onClick={handleAdd}
            disabled={adding || !emailValid}
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
          </Button>
        </div>
        {email.trim() && !emailValid && (
          <p className="text-[10px] text-destructive pl-1">请输入有效的邮箱地址</p>
        )}
      </div>

      {/* Collaborator list */}
      {loading ? (
        <p className="text-xs text-muted-foreground">加载中...</p>
      ) : collaborators.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          还没有协作者，输入邮箱邀请团队成员查看此报告
        </p>
      ) : (
        <div className="space-y-2">
          {collaborators.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/20 border border-border/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{c.collaborator_email}</span>
                <Badge
                  variant={c.status === "accepted" ? "default" : "outline"}
                  className="text-[10px] shrink-0"
                >
                  {c.status === "accepted" ? "已加入" : "待接受"}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => handleRemove(c.id)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

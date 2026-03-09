import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { ContentDraft, DraftStatus } from "@/hooks/useContentDrafts";
import { CheckCircle, Trash2, Edit3, Send, RotateCcw, Clock, Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface DraftEditorProps {
  draft: ContentDraft;
  onUpdate: (id: string, fields: Partial<ContentDraft>) => void;
  onDelete: (id: string) => void;
  onRegenerate?: (draft: ContentDraft) => void;
}

const statusConfig: Record<DraftStatus, { label: string; className: string; icon: React.ElementType }> = {
  draft: { label: "草稿", className: "bg-muted/50 text-muted-foreground border-border/30", icon: Clock },
  approved: { label: "已批准", className: "bg-secondary/15 text-secondary border-secondary/30", icon: CheckCircle },
  published: { label: "已发布", className: "bg-primary/15 text-primary border-primary/30", icon: Check },
};

const platformLabels: Record<string, string> = {
  xiaohongshu: "小红书",
  twitter: "Twitter/X",
  wechat: "公众号",
};

export function DraftEditor({ draft, onUpdate, onDelete, onRegenerate }: DraftEditorProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);

  const handleSave = () => {
    onUpdate(draft.id, { title, body });
    setEditing(false);
  };

  const handleApprove = () => {
    onUpdate(draft.id, { status: "approved" });
  };

  const sc = statusConfig[draft.status];
  const StatusIcon = sc.icon;

  return (
    <div className="group rounded-2xl border border-border/30 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${sc.className}`}>
            <StatusIcon className="w-3 h-3" />
            {sc.label}
          </span>
          <span className="text-[11px] text-muted-foreground/50">{platformLabels[draft.platform] ?? draft.platform}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {draft.status === "draft" && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg hover:bg-primary/10"
                onClick={() => setEditing(!editing)}
                title="编辑"
              >
                <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg hover:bg-secondary/10"
                onClick={handleApprove}
                title="批准"
              >
                <CheckCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-secondary transition-colors" />
              </Button>
              {onRegenerate && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-lg hover:bg-accent/10"
                  onClick={() => onRegenerate(draft)}
                  title="重新生成"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-muted-foreground hover:text-accent transition-colors" />
                </Button>
              )}
            </>
          )}
          {draft.status === "approved" && (
            <Button size="sm" className="h-7 gap-1.5 text-xs rounded-lg px-3 bg-gradient-to-r from-primary to-primary/80 shadow-sm">
              <Send className="w-3 h-3" /> 发布
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-lg hover:bg-destructive/10"
            onClick={() => onDelete(draft.id)}
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive transition-colors" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {editing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="标题"
              className="text-sm rounded-lg"
            />
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              className="text-sm rounded-lg resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} className="gap-1.5 rounded-lg">
                <Check className="w-3.5 h-3.5" /> 保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setEditing(false); setTitle(draft.title); setBody(draft.body); }}
                className="gap-1.5 rounded-lg"
              >
                <X className="w-3.5 h-3.5" /> 取消
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-1">
            {draft.title && (
              <p className="font-medium text-sm text-foreground/90 leading-snug">{draft.title}</p>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">
              {draft.body}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/10">
        <p className="text-[10px] text-muted-foreground/40">
          {new Date(draft.created_at).toLocaleString("zh-CN")}
        </p>
      </div>
    </div>
  );
}

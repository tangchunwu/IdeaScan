import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ContentDraft, DraftStatus } from "@/hooks/useContentDrafts";
import { CheckCircle, Trash2, Edit3, Send, RotateCcw } from "lucide-react";

interface DraftEditorProps {
  draft: ContentDraft;
  onUpdate: (id: string, fields: Partial<ContentDraft>) => void;
  onDelete: (id: string) => void;
  onRegenerate?: (draft: ContentDraft) => void;
}

const statusConfig: Record<DraftStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "草稿", variant: "outline" },
  approved: { label: "已批准", variant: "secondary" },
  published: { label: "已发布", variant: "default" },
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

  return (
    <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={sc.variant} className="shrink-0">{sc.label}</Badge>
          <span className="text-xs text-muted-foreground">{platformLabels[draft.platform] ?? draft.platform}</span>
        </div>
        <div className="flex items-center gap-1">
          {draft.status === "draft" && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(!editing)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleApprove}>
                <CheckCircle className="w-3.5 h-3.5 text-secondary" />
              </Button>
              {onRegenerate && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRegenerate(draft)}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          )}
          {draft.status === "approved" && (
            <Button size="sm" variant="default" className="h-7 gap-1 text-xs">
              <Send className="w-3 h-3" /> 发布
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(draft.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" className="text-sm" />
          <Textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="text-sm" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>保存</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setTitle(draft.title); setBody(draft.body); }}>取消</Button>
          </div>
        </div>
      ) : (
        <div>
          {draft.title && <p className="font-medium text-sm mb-1">{draft.title}</p>}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">{draft.body}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground/60">
        {new Date(draft.created_at).toLocaleString("zh-CN")}
      </p>
    </div>
  );
}

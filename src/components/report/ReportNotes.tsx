import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Save, Loader2, Check, CloudOff, Eye, Pencil } from "lucide-react";
import { useSkinToast } from "@/hooks/useSkinToast";
import ReactMarkdown from "react-markdown";

interface ReportNotesProps {
  validationId: string;
}

export function ReportNotes({ validationId }: ReportNotesProps) {
  const { user } = useAuth();
  const skinToast = useSkinToast();
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== savedContent;

  useEffect(() => {
    if (!user || !validationId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("report_notes" as any)
          .select("content")
          .eq("user_id", user.id)
          .eq("validation_id", validationId)
          .maybeSingle();
        if (error) throw error;
        const text = (data as any)?.content || "";
        setContent(text);
        setSavedContent(text);
      } catch (e) {
        console.error("Load notes error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, validationId]);

  const doSave = useCallback(async (text: string) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("report_notes" as any)
        .upsert(
          { user_id: user.id, validation_id: validationId, content: text, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id,validation_id" }
        );
      if (error) throw error;
      setSavedContent(text);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      console.error("Save notes error:", e);
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [user, validationId, saving, toast]);

  // Debounced auto-save
  useEffect(() => {
    if (loading || content === savedContent) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { doSave(content); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [content, savedContent, loading, doSave]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (content !== savedContent) doSave(content);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [content, savedContent, doSave]);

  if (!user) return null;

  return (
    <GlassCard className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm text-foreground">我的笔记</h4>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-lg border border-border/40 overflow-hidden mr-1">
            <button
              onClick={() => setMode("edit")}
              className={`px-2 py-1 text-[10px] flex items-center gap-1 transition-colors ${mode === "edit" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Pencil className="w-3 h-3" /> 编辑
            </button>
            <button
              onClick={() => setMode("preview")}
              className={`px-2 py-1 text-[10px] flex items-center gap-1 transition-colors ${mode === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Eye className="w-3 h-3" /> 预览
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs rounded-lg"
            onClick={() => doSave(content)}
            disabled={!isDirty || saving}
          >
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : justSaved ? <Check className="w-3 h-3 mr-1 text-secondary" /> : <Save className="w-3 h-3 mr-1" />}
            {justSaved ? "已保存" : "保存"}
          </Button>
        </div>
      </div>

      {mode === "edit" ? (
        <Textarea
          placeholder={loading ? "加载中..." : "支持 Markdown 语法，⌘+S 保存"}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[160px] text-sm bg-muted/20 border-border/30 rounded-xl resize-y font-mono"
          disabled={loading}
        />
      ) : (
        <div className="min-h-[160px] p-3 text-sm bg-muted/20 border border-border/30 rounded-xl overflow-auto prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-code:text-primary prose-code:bg-muted/40 prose-code:px-1 prose-code:rounded">
          {content ? (
            <ReactMarkdown>{content}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic">暂无内容</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5">
        {isDirty ? (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CloudOff className="w-3 h-3" /> 未保存 · 2秒后自动保存
          </p>
        ) : (
          <span />
        )}
        <p className="text-[10px] text-muted-foreground">{content.length} 字</p>
      </div>
    </GlassCard>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type DraftPlatform = "xiaohongshu" | "twitter" | "wechat";
export type DraftStatus = "draft" | "approved" | "published";

export interface ContentDraft {
  id: string;
  user_id: string;
  validation_id: string | null;
  topic: string;
  brand_voice: Record<string, unknown>;
  platform: DraftPlatform;
  title: string;
  body: string;
  images: string[];
  status: DraftStatus;
  openclaw_session_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface CreateDraftInput {
  topic: string;
  brand_voice: Record<string, unknown>;
  platform: DraftPlatform;
  title: string;
  body: string;
  images?: string[];
  validation_id?: string;
  openclaw_session_id?: string;
}

export function useContentDrafts() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const draftsQuery = useQuery({
    queryKey: ["content-drafts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_drafts" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as ContentDraft[]) ?? [];
    },
    enabled: !!user?.id,
  });

  const createDraft = useMutation({
    mutationFn: async (input: CreateDraftInput) => {
      const { data, error } = await supabase
        .from("content_drafts" as any)
        .insert({
          user_id: user!.id,
          topic: input.topic,
          brand_voice: input.brand_voice,
          platform: input.platform,
          title: input.title,
          body: input.body,
          images: input.images ?? [],
          validation_id: input.validation_id ?? null,
          openclaw_session_id: input.openclaw_session_id ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ContentDraft;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-drafts"] });
      toast.success("草稿已保存");
    },
    onError: (e: Error) => toast.error(`保存失败: ${e.message}`),
  });

  const updateDraft = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<ContentDraft> & { id: string }) => {
      const { error } = await supabase
        .from("content_drafts" as any)
        .update({ ...fields, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-drafts"] });
    },
  });

  const deleteDraft = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("content_drafts" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-drafts"] });
      toast.success("草稿已删除");
    },
  });

  return {
    drafts: draftsQuery.data ?? [],
    isLoading: draftsQuery.isLoading,
    createDraft,
    updateDraft,
    deleteDraft,
  };
}

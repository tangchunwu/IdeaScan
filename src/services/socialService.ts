import { supabase } from "@/integrations/supabase/client";
import type { Comment, Persona, CreateCommentInput } from "@/types/social";

export interface LLMConfig {
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
}

export interface DiscussionMeta {
  fallbackUsed?: boolean;
  failedPersonas?: string[];
  warnings?: string[];
}

export interface DiscussionResult {
  comments: Comment[];
  meta?: DiscussionMeta;
}

export interface ReplyResult {
  userComment: Comment;
  aiReply: Comment;
  meta?: DiscussionMeta;
}

// Get all personas (only safe public fields, excludes sensitive system_prompt)
export async function getPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from("personas")
    .select("id, name, role, avatar_url, personality, focus_areas, catchphrase, is_active, created_at")
    .eq("is_active", true);

  if (error) throw error;
  return (data || []).map(p => ({ ...p, system_prompt: '' }));
}

// Get comments for a validation (only safe persona fields)
export async function getComments(validationId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select(`
      *,
      persona:personas(id, name, role, avatar_url, personality, focus_areas, catchphrase, is_active, created_at)
    `)
    .eq("validation_id", validationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map((c: any) => ({
    ...c,
    persona: c.persona ? { ...c.persona, system_prompt: '' } : undefined
  }));
}

// Generate initial AI discussion
export async function generateDiscussion(validationId: string, config?: LLMConfig): Promise<DiscussionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const body: any = { validation_id: validationId };
  if (config?.llmApiKey || config?.llmBaseUrl || config?.llmModel) {
    body.config = {
      llmApiKey: config.llmApiKey || undefined,
      llmBaseUrl: config.llmBaseUrl || undefined,
      llmModel: config.llmModel || undefined,
    };
  }

  const response = await supabase.functions.invoke("generate-discussion", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) {
    // Try to extract meaningful error from response data
    const errMsg = response.data?.error || response.error.message || "生成讨论失败";
    throw new Error(errMsg);
  }

  return {
    comments: response.data?.comments || [],
    meta: response.data?.meta,
  };
}

// Reply to an AI comment
export async function replyToComment(
  commentId: string,
  userReply: string,
  config?: LLMConfig
): Promise<ReplyResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const body: any = { comment_id: commentId, user_reply: userReply };
  if (config?.llmApiKey || config?.llmBaseUrl || config?.llmModel) {
    body.config = {
      llmApiKey: config.llmApiKey || undefined,
      llmBaseUrl: config.llmBaseUrl || undefined,
      llmModel: config.llmModel || undefined,
    };
  }

  const response = await supabase.functions.invoke("reply-to-comment", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) {
    const errMsg = response.data?.error || response.error.message || "回复失败";
    throw new Error(errMsg);
  }

  return {
    userComment: response.data?.userComment,
    aiReply: response.data?.aiReply,
    meta: response.data?.meta,
  };
}

// Like/Unlike a comment
export async function toggleCommentLike(commentId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing, error: checkError } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (checkError) { console.error("Check like error:", checkError); throw checkError; }

  if (existing) {
    const { error: deleteError } = await supabase.from("comment_likes").delete().eq("id", (existing as any).id);
    if (deleteError) throw deleteError;
    return false;
  } else {
    const { error: insertError } = await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: user.id } as any);
    if (insertError?.code === '23505') return true;
    if (insertError) throw insertError;
    return true;
  }
}

// Check if user has liked specific comments
export async function getUserLikes(commentIds: string[]): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || commentIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("comment_likes")
    .select("comment_id")
    .eq("user_id", user.id)
    .in("comment_id", commentIds);

  if (error) { console.error("Get likes error:", error); return new Set(); }
  return new Set((data || []).map((d: any) => d.comment_id));
}

// Create a user comment
export async function createUserComment(input: CreateCommentInput): Promise<Comment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("comments")
    .insert({
      validation_id: input.validation_id,
      user_id: user.id,
      content: input.content,
      parent_id: input.parent_id || null,
      is_ai: false,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as Comment;
}

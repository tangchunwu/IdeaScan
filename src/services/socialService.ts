import { supabase } from "@/integrations/supabase/client";
import type { Comment, Persona, CreateCommentInput } from "@/types/social";

// Get all personas (only safe public fields, excludes sensitive system_prompt)
export async function getPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from("personas")
    .select("id, name, role, avatar_url, personality, focus_areas, catchphrase, is_active, created_at")
    .eq("is_active", true);

  if (error) throw error;
  // Map to include system_prompt as empty string since it's not exposed to clients
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
  // Map persona data to include empty system_prompt
  return (data || []).map((c: any) => ({
    ...c,
    persona: c.persona ? { ...c.persona, system_prompt: '' } : undefined
  }));
}

// Generate initial AI discussion
export async function generateDiscussion(validationId: string): Promise<Comment[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await supabase.functions.invoke("generate-discussion", {
    body: { validation_id: validationId },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) throw response.error;
  return response.data?.comments || [];
}

// Reply to an AI comment
export async function replyToComment(
  commentId: string,
  userReply: string
): Promise<{ userComment: Comment; aiReply: Comment }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await supabase.functions.invoke("reply-to-comment", {
    body: { comment_id: commentId, user_reply: userReply },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) throw response.error;
  return response.data;
}

// Like/Unlike a comment
export async function toggleCommentLike(commentId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if already liked - use maybeSingle to avoid 406 error
  const { data: existing, error: checkError } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (checkError) {
    console.error("Check like error:", checkError);
    throw checkError;
  }

  if (existing) {
    // Unlike
    const { error: deleteError } = await supabase
      .from("comment_likes")
      .delete()
      .eq("id", (existing as any).id);
    if (deleteError) throw deleteError;
    return false;
  } else {
    // Like - handle potential conflict gracefully
    const { error: insertError } = await supabase
      .from("comment_likes")
      .insert({ comment_id: commentId, user_id: user.id } as any);
    
    // If conflict (already liked), just return true
    if (insertError?.code === '23505') {
      return true;
    }
    if (insertError) throw insertError;
    return true;
  }
}

// Create a user comment (not reply, just a standalone comment)
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

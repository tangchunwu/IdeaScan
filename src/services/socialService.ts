import { supabase } from "@/integrations/supabase/client";
import type { Comment, Persona, CreateCommentInput } from "@/types/social";

// Get all personas
export async function getPersonas(): Promise<Persona[]> {
       const { data, error } = await supabase
              .from("personas")
              .select("*")
              .eq("is_active", true);

       if (error) throw error;
       return data || [];
}

// Get comments for a validation
export async function getComments(validationId: string): Promise<Comment[]> {
       const { data, error } = await supabase
              .from("comments")
              .select(`
      *,
      persona:personas(*)
    `)
              .eq("validation_id", validationId)
              .order("created_at", { ascending: true });

       if (error) throw error;
       return data || [];
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

       // Check if already liked
       const { data: existing } = await supabase
              .from("comment_likes")
              .select("id")
              .eq("comment_id", commentId)
              .eq("user_id", user.id)
              .single();

       if (existing) {
              // Unlike
              await supabase
                     .from("comment_likes")
                     .delete()
                     .eq("id", existing.id);
              return false;
       } else {
              // Like
              await supabase
                     .from("comment_likes")
                     .insert({ comment_id: commentId, user_id: user.id });
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
              })
              .select()
              .single();

       if (error) throw error;
       return data;
}

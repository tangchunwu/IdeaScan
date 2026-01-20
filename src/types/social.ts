// VC Circle Types

export interface Persona {
       id: string;
       name: string;
       role: string;
       avatar_url: string | null;
       personality: string | null;
       system_prompt: string;
       focus_areas: string[] | null;
       catchphrase: string | null;
       is_active: boolean;
       created_at: string;
}

export interface Comment {
       id: string;
       validation_id: string;
       persona_id: string | null;
       user_id: string | null;
       content: string;
       parent_id: string | null;
       likes_count: number;
       is_ai: boolean;
       created_at: string;

       // Joined data
       persona?: Persona;
       replies?: Comment[];
       user_has_liked?: boolean;
}

export interface CommentWithPersona extends Comment {
       persona: Persona;
}

export interface CreateCommentInput {
       validation_id: string;
       content: string;
       parent_id?: string;
}

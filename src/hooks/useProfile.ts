import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Profile {
  id: string;
  avatar_url: string | null;
  display_name: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, avatar_url, display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to fetch profile:", error);
        return;
      }

      if (!data) {
        // Create profile for existing user
        const { data: newProfile } = await supabase
          .from("profiles")
          .insert({ id: user.id })
          .select("id, avatar_url, display_name")
          .single();
        setProfile(newProfile as Profile | null);
      } else {
        setProfile(data as Profile);
      }
    };

    fetchProfile();
  }, [user?.id]);

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("头像文件不能超过 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/avatar.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : null);
      toast.success("头像已更新");
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      toast.error("头像上传失败，请重试");
    } finally {
      setIsUploading(false);
    }
  };

  return { profile, isUploading, uploadAvatar };
}

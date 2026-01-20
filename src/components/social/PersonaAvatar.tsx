import { cn } from "@/lib/utils";

interface PersonaAvatarProps {
       name: string;
       avatarUrl?: string | null;
       role: string;
       size?: "sm" | "md" | "lg";
       className?: string;
}

const roleColors: Record<string, string> = {
       vc: "from-amber-500 to-orange-600",
       pm: "from-blue-500 to-indigo-600",
       user: "from-pink-500 to-rose-600",
       analyst: "from-emerald-500 to-teal-600",
};

const roleEmojis: Record<string, string> = {
       vc: "💰",
       pm: "📱",
       user: "🙋",
       analyst: "📊",
};

export function PersonaAvatar({
       name,
       avatarUrl,
       role,
       size = "md",
       className
}: PersonaAvatarProps) {
       const sizeClasses = {
              sm: "w-8 h-8 text-xs",
              md: "w-10 h-10 text-sm",
              lg: "w-14 h-14 text-lg",
       };

       const gradientClass = roleColors[role] || "from-gray-500 to-gray-600";
       const emoji = roleEmojis[role] || "🤖";

       if (avatarUrl) {
              return (
                     <div className={cn("relative", className)}>
                            <img
                                   src={avatarUrl}
                                   alt={name}
                                   className={cn(
                                          "rounded-full object-cover ring-2 ring-white/20",
                                          sizeClasses[size]
                                   )}
                            />
                            <span className="absolute -bottom-1 -right-1 text-xs">
                                   {emoji}
                            </span>
                     </div>
              );
       }

       // Fallback: gradient with initials
       const initials = name.slice(0, 2);

       return (
              <div className={cn("relative", className)}>
                     <div
                            className={cn(
                                   "rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br shadow-lg",
                                   gradientClass,
                                   sizeClasses[size]
                            )}
                     >
                            {initials}
                     </div>
                     <span className="absolute -bottom-1 -right-1 text-xs">
                            {emoji}
                     </span>
              </div>
       );
}

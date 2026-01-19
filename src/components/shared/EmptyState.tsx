import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "./GlassCard";
import { Link } from "react-router-dom";

interface EmptyStateProps {
       icon: LucideIcon;
       title: string;
       description: string;
       actionLabel?: string;
       actionLink?: string;
       onAction?: () => void;
       className?: string;
}

export const EmptyState = ({
       icon: Icon,
       title,
       description,
       actionLabel,
       actionLink,
       onAction,
       className,
}: EmptyStateProps) => {
       return (
              <GlassCard className={`text-center py-12 animate-slide-up ${className || ""}`}>
                     <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                            <Icon className="w-8 h-8 text-muted-foreground" />
                     </div>
                     <h3 className="text-xl font-semibold text-foreground mb-3">{title}</h3>
                     <p className="text-muted-foreground mb-8 max-w-sm mx-auto">{description}</p>

                     {(actionLabel && (actionLink || onAction)) && (
                            <Button
                                   asChild={!!actionLink}
                                   onClick={onAction}
                                   size="lg"
                                   className="rounded-xl px-8"
                            >
                                   {actionLink ? (
                                          <Link to={actionLink}>{actionLabel}</Link>
                                   ) : (
                                          actionLabel
                                   )}
                            </Button>
                     )}
              </GlassCard>
       );
};

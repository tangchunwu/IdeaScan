import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "./GlassCard";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

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
              <GlassCard className={`text-center py-16 animate-slide-up bg-opacity-60 border-white/20 ${className || ""}`}>
                     <motion.div
                            className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 relative overflow-hidden"
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                     >
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent opacity-50" />
                            <Icon className="w-10 h-10 text-primary relative z-10" />
                     </motion.div>

                     <h3 className="text-2xl font-bold text-foreground mb-3 tracking-tight">{title}</h3>
                     <p className="text-muted-foreground mb-8 max-w-sm mx-auto text-lg leading-relaxed">{description}</p>

                     {(actionLabel && (actionLink || onAction)) && (
                            <Button
                                   asChild={!!actionLink}
                                   onClick={onAction}
                                   size="lg"
                                   className="rounded-full px-8 h-12 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300"
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

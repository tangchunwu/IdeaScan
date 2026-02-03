import { motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { cn } from "@/lib/utils";

interface BrandLoaderProps {
       className?: string;
       text?: string;
       fullScreen?: boolean;
}

export const BrandLoader = ({ className, text = "Loading...", fullScreen = false }: BrandLoaderProps) => {
       const content = (
              <div className={cn("flex flex-col items-center justify-center gap-6", className)}>
                     <div className="relative">
                            {/* Outer breathing ring */}
                            <motion.div
                                   animate={{
                                          scale: [1, 1.2, 1],
                                          opacity: [0.3, 0.1, 0.3],
                                   }}
                                   transition={{
                                          duration: 3,
                                          repeat: Infinity,
                                          ease: "easeInOut",
                                   }}
                                   className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
                            />

                            {/* Rotating ring */}
                            <motion.div
                                   animate={{ rotate: 360 }}
                                   transition={{
                                          duration: 8,
                                          repeat: Infinity,
                                          ease: "linear",
                                   }}
                                   className="absolute -inset-4 rounded-full border border-dashed border-primary/30"
                            />

                            {/* Logo with pulse */}
                            <motion.div
                                   animate={{
                                          scale: [1, 1.05, 1],
                                   }}
                                   transition={{
                                          duration: 2,
                                          repeat: Infinity,
                                          ease: "easeInOut",
                                   }}
                                   className="relative z-10 p-4 rounded-3xl bg-background/50 backdrop-blur-sm border border-white/20 shadow-2xl"
                            >
                                   <BrandLogo variant="icon" size="xl" />
                            </motion.div>
                     </div>

                     {/* Loading Text */}
                     <div className="flex flex-col items-center gap-2">
                            <motion.span
                                   initial={{ opacity: 0, y: 5 }}
                                   animate={{ opacity: 1, y: 0 }}
                                   transition={{ delay: 0.2 }}
                                   className="text-lg font-medium text-foreground/80 tracking-wide"
                            >
                                   {text}
                            </motion.span>

                            {/* Progress bar simulation */}
                            <div className="w-32 h-1 bg-muted rounded-full overflow-hidden">
                                   <motion.div
                                          className="h-full bg-primary"
                                          initial={{ x: "-100%" }}
                                          animate={{ x: "100%" }}
                                          transition={{
                                                 repeat: Infinity,
                                                 duration: 1.5,
                                                 ease: "easeInOut",
                                          }}
                                   />
                            </div>
                     </div>
              </div>
       );

       if (fullScreen) {
              return (
                     <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
                            {content}
                     </div>
              );
       }

       return content;
};

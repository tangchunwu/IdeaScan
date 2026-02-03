import { useRef, useEffect, useState } from "react";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { Users, CheckCircle } from "lucide-react";

interface SocialProofCounterProps {
       count?: number;
       label?: string;
}

const avatars = [
       "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=John",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
       "https://api.dicebear.com/7.x/avataaars/svg?seed=Mike",
];

export function SocialProofCounter({
       count = 1258,
       label = "个创意已验证"
}: SocialProofCounterProps) {
       const ref = useRef<HTMLDivElement>(null);
       const isInView = useInView(ref, { once: true, margin: "-100px" });
       const spring = useSpring(0, { mass: 0.8, stiffness: 75, damping: 15 });
       const displayValue = useTransform(spring, (current) => Math.round(current));

       useEffect(() => {
              if (isInView) {
                     spring.set(count);
              }
       }, [isInView, count, spring]);

       const [currentCount, setCurrentCount] = useState(0);

       useEffect(() => {
              const unsubscribe = displayValue.on("change", (v) => setCurrentCount(v));
              return unsubscribe;
       }, [displayValue]);

       return (
              <div ref={ref} className="flex flex-col sm:flex-row items-center gap-4 py-6 px-6 glass-card rounded-2xl">
                     {/* Avatar Stack */}
                     <div className="flex -space-x-3">
                            {avatars.map((src, i) => (
                                   <motion.img
                                          key={i}
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={isInView ? { opacity: 1, x: 0 } : {}}
                                          transition={{ delay: i * 0.1 }}
                                          src={src}
                                          alt="User avatar"
                                          className="w-10 h-10 rounded-full border-2 border-background bg-muted object-cover shadow-sm hover:z-10 hover:scale-110 transition-transform"
                                   />
                            ))}
                            <div className="w-10 h-10 rounded-full border-2 border-background bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                   99+
                            </div>
                     </div>

                     {/* Counter Text */}
                     <div className="text-center sm:text-left">
                            <div className="flex items-center justify-center sm:justify-start gap-2">
                                   <div className="flex items-baseline gap-1">
                                          <motion.span
                                                 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary"
                                          >
                                                 {currentCount.toLocaleString()}
                                          </motion.span>
                                          <span className="text-sm font-medium text-muted-foreground">{label}</span>
                                   </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                   <CheckCircle className="w-3.5 h-3.5 text-primary" />
                                   <span className="text-xs text-muted-foreground">
                                          来自真实用户提交 • 每日更新
                                   </span>
                            </div>
                     </div>
              </div>
       );
}

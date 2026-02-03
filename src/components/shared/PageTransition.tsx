import { motion } from "framer-motion";
import { ReactNode } from "react";

interface PageTransitionProps {
       children: ReactNode;
       className?: string;
}

const pageVariants = {
       initial: {
              opacity: 0,
              y: 10,
              filter: "blur(4px)"
       },
       enter: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: {
                     duration: 0.4,
                     ease: [0.22, 1, 0.36, 1], // Custom cubic bezier for smooth feel
                     staggerChildren: 0.1
              }
       },
       exit: {
              opacity: 0,
              y: -10,
              filter: "blur(4px)",
              transition: {
                     duration: 0.3,
                     ease: "easeIn"
              }
       }
};

export const PageTransition = ({ children, className }: PageTransitionProps) => {
       return (
              <motion.div
                     initial="initial"
                     animate="enter"
                     exit="exit"
                     variants={pageVariants}
                     className={className}
              >
                     {children}
              </motion.div>
       );
};

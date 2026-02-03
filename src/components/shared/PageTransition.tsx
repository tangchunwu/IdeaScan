import { motion, Transition } from "framer-motion";
import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const transition: Transition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1],
};

const exitTransition: Transition = {
  duration: 0.3,
  ease: "easeIn",
};

export const PageTransition = ({ children, className }: PageTransitionProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition }}
      exit={{ opacity: 0, y: -10, filter: "blur(4px)", transition: exitTransition }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

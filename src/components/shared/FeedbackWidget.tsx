import { useState } from "react";
import { MessageSquare, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { captureEvent } from "@/lib/posthog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const FeedbackWidget = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("请选择一个评分");
      return;
    }

    setIsSubmitting(true);

    try {
      // Insert feedback into database
      const { error } = await supabase.from('user_feedback').insert({
        user_id: user?.id || null,
        rating,
        feedback_text: feedback || null,
        page_url: window.location.pathname,
      });

      if (error) throw error;

      // Track feedback submitted event
      captureEvent('feedback_submitted', {
        rating,
        has_feedback_text: feedback.length > 0,
        feedback_length: feedback.length,
        page_url: window.location.pathname,
      });

      toast.success("感谢您的反馈！");
      setIsOpen(false);
      setRating(0);
      setFeedback("");
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast.error("提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 backdrop-blur-sm border border-white/10 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 group"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-sm font-medium">反馈</span>
          </motion.button>
        )}
      </AnimatePresence>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background/95 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">您的反馈对我们很重要</DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm text-muted-foreground">您对 IdeaScan 满意吗？</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    type="button"
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setRating(star)}
                    className="p-1 transition-colors focus:outline-none"
                  >
                    <Star
                      className={`w-8 h-8 transition-all duration-200 ${
                        star <= rating
                          ? "fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                          : "text-muted-foreground/30 hover:text-muted-foreground/50"
                      }`}
                    />
                  </motion.button>
                ))}
              </div>
              {rating > 0 && (
                <motion.span
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-muted-foreground"
                >
                  {rating === 5 ? "非常满意！" : rating === 4 ? "比较满意" : rating === 3 ? "一般" : rating === 2 ? "不太满意" : "很不满意"}
                </motion.span>
              )}
            </div>

            <div className="space-y-2">
              <Textarea
                placeholder="请告诉我们哪里可以做得更好..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[100px] resize-none bg-muted/50 border-white/10 focus:border-primary/50"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              取消
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || rating === 0}
              className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              {isSubmitting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                  />
                  发送中...
                </>
              ) : (
                <>
                  发送反馈 <Send className="w-4 h-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FeedbackWidget;

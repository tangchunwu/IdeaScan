import { useState } from "react";
import { MessageSquare, X, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

const FeedbackWidget = () => {
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

              // Simulate API call
              console.log("Submitting feedback:", { rating, feedback, url: window.location.href });

              // TODO: Implement actual Supabase insertion here
              // const { error } = await supabase.from('user_feedback').insert({ ... })

              await new Promise(resolve => setTimeout(resolve, 1000));

              toast.success("感谢您的反馈！");
              setIsSubmitting(false);
              setIsOpen(false);
              setRating(0);
              setFeedback("");
       };

       return (
              <>
                     <AnimatePresence>
                            {!isOpen && (
                                   <motion.button
                                          initial={{ opacity: 0, scale: 0.8 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.8 }}
                                          onClick={() => setIsOpen(true)}
                                          className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 group"
                                   >
                                          <MessageSquare className="w-6 h-6" />
                                          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap ml-0 group-hover:ml-2">
                                                 反馈建议
                                          </span>
                                   </motion.button>
                            )}
                     </AnimatePresence>

                     <Dialog open={isOpen} onOpenChange={setIsOpen}>
                            <DialogContent className="sm:max-w-[425px]">
                                   <DialogHeader>
                                          <DialogTitle>您的反馈对我们很重要</DialogTitle>
                                   </DialogHeader>

                                   <div className="grid gap-6 py-4">
                                          <div className="flex flex-col items-center gap-2">
                                                 <span className="text-sm text-muted-foreground">您对 IdeaScan 满意吗？</span>
                                                 <div className="flex gap-2">
                                                        {[1, 2, 3, 4, 5].map((star) => (
                                                               <button
                                                                      key={star}
                                                                      type="button"
                                                                      onClick={() => setRating(star)}
                                                                      className={`transition-all hover:scale-110 focus:outline-none ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"
                                                                             }`}
                                                               >
                                                                      <Star className={`w-8 h-8 ${star <= rating ? "fill-yellow-400" : ""}`} />
                                                               </button>
                                                        ))}
                                                 </div>
                                          </div>

                                          <div className="space-y-2">
                                                 <Textarea
                                                        placeholder="请告诉我们哪里可以做得更好..."
                                                        value={feedback}
                                                        onChange={(e) => setFeedback(e.target.value)}
                                                        className="min-h-[100px] resize-none"
                                                 />
                                          </div>
                                   </div>

                                   <DialogFooter>
                                          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                                                 取消
                                          </Button>
                                          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                                                 {isSubmitting ? "发送中..." : (
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

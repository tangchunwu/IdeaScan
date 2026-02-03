import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "./GlassCard";

export const ChartSkeleton = () => {
       return (
              <GlassCard className="h-full flex flex-col p-6 space-y-4">
                     <div className="flex items-center gap-3 mb-2">
                            <Skeleton className="h-5 w-5 rounded-full" />
                            <Skeleton className="h-6 w-32" />
                     </div>
                     <div className="flex-1 flex items-end gap-2 px-2 pb-2">
                            <Skeleton className="h-[60%] w-full rounded-t-lg opacity-80" />
                            <Skeleton className="h-[40%] w-full rounded-t-lg opacity-60" />
                            <Skeleton className="h-[80%] w-full rounded-t-lg opacity-90" />
                            <Skeleton className="h-[50%] w-full rounded-t-lg opacity-70" />
                            <Skeleton className="h-[70%] w-full rounded-t-lg opacity-85" />
                            <Skeleton className="h-[30%] w-full rounded-t-lg opacity-50" />
                     </div>
              </GlassCard>
       );
};

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export function OnboardingTour() {
       useEffect(() => {
              const hasSeenTour = localStorage.getItem("has-seen-tour");

              // Only show if user hasn't seen it
              // For debugging/development, we might want to temporarily comment out the check
              if (hasSeenTour) return;

              const driverObj = driver({
                     showProgress: true,
                     animate: true,
                     doneBtnText: "开始使用",
                     nextBtnText: "下一步",
                     prevBtnText: "上一步",
                     steps: [
                            {
                                   element: "h1",
                                   popover: {
                                          title: "欢迎使用创意验证器",
                                          description: "这是一个利用 AI 和大数据帮你验证商业想法的神器。不要盲目开发，先验证需求！",
                                          side: "bottom",
                                          align: 'start'
                                   }
                            },
                            {
                                   element: 'a[href="/validate"]',
                                   popover: {
                                          title: "核心功能：验证想法",
                                          description: "点击这里，输入你的一句话想法，我们将为你生成全方位的分析报告。",
                                          side: "bottom"
                                   }
                            },
                            {
                                   element: 'a[href="/discover"]',
                                   popover: {
                                          title: "发现灵感",
                                          description: "不知道做什么？来看看当前热门的市场趋势和红海/蓝海赛道。",
                                          side: "bottom"
                                   }
                            },
                            {
                                   element: 'a[href="/history"]',
                                   popover: {
                                          title: "历史记录",
                                          description: "你验证过的所有报告都保存在这里，方便随时回顾。",
                                          side: "bottom",
                                          align: 'start'
                                   }
                            }
                     ],
                     onDestroyed: () => {
                            localStorage.setItem("has-seen-tour", "true");
                     }
              });

              // Small delay to ensure elements are rendered
              const timer = setTimeout(() => {
                     driverObj.drive();
              }, 1500);

              return () => {
                     clearTimeout(timer);
                     driverObj.destroy();
              };
       }, []);

       return null; // This component doesn't render anything visible directly
}

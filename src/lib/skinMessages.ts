import type { Skin } from "@/hooks/useTheme";

/* ========================================
   皮肤感知文案系统
   每套皮肤有独立的 toast / 空状态 / CTA 文案
   ======================================== */

export interface SkinCopy {
  // Empty state
  emptyTitle: string;
  emptyDescription: string;
  emptyCTA: string;
  emptyEmoji: string;

  // Toast — success / error / info
  toastSuccess: (detail?: string) => string;
  toastError: (detail?: string) => string;
  toastInfo: (detail?: string) => string;

  // Loading
  loading: string;
}

const ghibliCopy: SkinCopy = {
  emptyTitle: "这里还什么都没有呢",
  emptyDescription: "就像风吹过空旷的草原，一切还等着被发现。要不要开始你的第一次探索？",
  emptyCTA: "开始探索",
  emptyEmoji: "🐾",
  toastSuccess: (d) => d ? `喵~ ${d}` : "喵~ 操作成功啦！",
  toastError: (d) => d ? `哎呀~ ${d}` : "哎呀~ 出了点小问题，再试一次吧",
  toastInfo: (d) => d || "喵~ 这里有个小提示",
  loading: "喵~ 加载中...",
};

const streetCopy: SkinCopy = {
  emptyTitle: "空空如也",
  emptyDescription: "这里还没有内容。动手创建第一条吧。",
  emptyCTA: "创建",
  emptyEmoji: "",
  toastSuccess: (d) => d || "Done.",
  toastError: (d) => d || "操作失败，请重试",
  toastInfo: (d) => d || "提示",
  loading: "加载中...",
};

const driftCopy: SkinCopy = {
  emptyTitle: "水面平静，什么都没有漂来",
  emptyDescription: "不急，等潮水带来新的东西吧。或者你想自己划过去看看？",
  emptyCTA: "去看看",
  emptyEmoji: "🦦",
  toastSuccess: (d) => d ? `嗯~ ${d}` : "嗯~ 慢慢来，已经好了",
  toastError: (d) => d ? `噢~ ${d}` : "噢~ 水獭打了个滑，再来一次",
  toastInfo: (d) => d || "水獭建议你——慢慢来，不急",
  loading: "漂着呢，不急...",
};

const cottonCopy: SkinCopy = {
  emptyTitle: "……这里还没有任何东西",
  emptyDescription: "没关系，棉棉已经在泡新的一壶了。要不要一起等？",
  emptyCTA: "陪棉棉等一会儿",
  emptyEmoji: "🐰",
  toastSuccess: (d) => d ? `好啦～${d}，要好好休息哦。` : "好啦～棉棉帮你记住了，要好好休息哦。",
  toastError: (d) => d ? `好像出了一点小问题……${d}。棉棉在这里，我们再试一次好吗？` : "好像出了一点小问题……棉棉在这里，我们再试一次好吗？",
  toastInfo: (d) => d ? `棉棉想提醒你——${d}，不急，慢慢来。` : "棉棉想提醒你——记得先完成上一步，不急，慢慢来。",
  loading: "棉棉在泡茶，等一等～",
};

const bambooCopy: SkinCopy = {
  emptyTitle: "根据第47号研究记录……这里什么都没有",
  emptyDescription: "可能是松鼠。竹竹去查一下文献，你在这儿等——不，算了，一起去吧。",
  emptyCTA: "陪竹竹去找找看",
  emptyEmoji: "🐼",
  toastSuccess: (d) => d ? `已记录！${d}` : "已记录！竹竹的第 48 号研究样本入库。",
  toastError: (d) => d ? `哎呀！${d}……竹竹摔了一跤，稍等他爬起来重试。` : "哎呀！提交失败了……竹竹摔了一跤，稍等他爬起来重试。",
  toastInfo: (d) => d ? `竹竹建议：${d}` : "竹竹建议：这个操作需要先完成上一步记录。",
  loading: "竹竹正在查阅文献...",
};

const SKIN_COPY: Record<Skin, SkinCopy> = {
  ghibli: ghibliCopy,
  street: streetCopy,
  drift: driftCopy,
  cotton: cottonCopy,
  bamboo: bambooCopy,
};

export const getSkinCopy = (skin: Skin): SkinCopy => SKIN_COPY[skin] ?? ghibliCopy;

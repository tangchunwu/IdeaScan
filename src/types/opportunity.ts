// 权威定义在 supabase/functions/_shared/opportunity-types.ts（边缘函数部署包只含 functions 目录）。
// 这里只做再导出，让前端继续使用 @/types/opportunity 而不会与后端产生两套类型。
export * from '../../supabase/functions/_shared/opportunity-types';

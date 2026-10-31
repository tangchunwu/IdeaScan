export interface FunctionInvokeResult {
  data?: unknown;
  error?: { message?: string } | null;
}

export function getFunctionInvokeError(result: FunctionInvokeResult) {
  return result.error || null;
}

export interface ValidateRouteIntent {
  idea: string;
  auto: boolean;
  resumeValidationId: string;
}

export function getValidateRouteIntent(params: URLSearchParams): ValidateRouteIntent {
  return {
    idea: params.get("idea") || params.get("topic") || "",
    auto: params.get("auto") === "true",
    resumeValidationId: params.get("resumeValidationId") || "",
  };
}

export function createValidateAuthRedirect(params: URLSearchParams): string {
  const query = params.toString();
  const destination = query ? `/validate?${query}` : "/validate";
  return `/auth?redirect=${encodeURIComponent(destination)}`;
}

export function getDiscoverValidationUrl(topic: string): string {
  return `/validate?idea=${encodeURIComponent(topic)}`;
}

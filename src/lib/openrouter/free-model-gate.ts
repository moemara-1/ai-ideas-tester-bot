import { getServerEnv } from "../env/server-env";

const FREE_MODEL_SUFFIX = ":free";

export class FreeModelViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeModelViolationError";
  }
}

function normalize(model: string): string {
  return model.trim().toLowerCase();
}

export function isFreeOpenRouterModelAllowed(
  model: string,
  allowlist: string[] = getServerEnv().OPENROUTER_FREE_MODEL_ALLOWLIST
): boolean {
  const normalized = normalize(model);
  return normalized.endsWith(FREE_MODEL_SUFFIX) && allowlist.includes(normalized);
}

export function assertFreeOpenRouterModelAllowed(
  model: string,
  allowlist: string[] = getServerEnv().OPENROUTER_FREE_MODEL_ALLOWLIST
): void {
  const normalized = normalize(model);

  if (!normalized.endsWith(FREE_MODEL_SUFFIX)) {
    throw new FreeModelViolationError(
      `Model \"${model}\" is not a free-tier model. Suffix ${FREE_MODEL_SUFFIX} is required.`
    );
  }

  if (!allowlist.includes(normalized)) {
    throw new FreeModelViolationError(
      `Model \"${model}\" is not in OPENROUTER_FREE_MODEL_ALLOWLIST.`
    );
  }
}

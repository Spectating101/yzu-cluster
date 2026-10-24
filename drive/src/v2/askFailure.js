const QUOTA = /exceeded (?:your )?(?:monthly )?quota|quota (?:exceeded|exhausted)|rate limit/i;
const BROKEN = /could not complete that turn|composer session expired|internal:\s*internal error/i;

export function friendlyAssistantReply(reply) {
  const text = String(reply || "");
  if (QUOTA.test(text)) {
    return "The research assistant has used up its provider's capacity for now, so it can't answer. Library, Discover and downloads still work; Ask returns when capacity is restored.";
  }
  if (BROKEN.test(text)) {
    return "The research assistant couldn't complete this answer. Try again in a moment; Library, Discover and downloads still work.";
  }
  return text;
}

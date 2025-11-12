// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function truncatePayloadForLogging(payload: any, maxLength = 1024): any {
  if (payload === null || payload === undefined) {
    return payload;
  }
  try {
    const stringified = JSON.stringify(payload);
    if (stringified.length <= maxLength) {
      return payload;
    }
    return stringified.substring(0, maxLength) + "...[truncated]";
  } catch {
    return "[unable to stringify]";
  }
}


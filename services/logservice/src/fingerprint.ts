import { createHash } from 'crypto';

export function computeFingerprint(
  service: string,
  errorType: string,
  message: string,
  stackTrace?: string,
): string {
  const normalizedMessage = message
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<UUID>',
    )
    .replace(/\b\d{4,}\b/g, '<NUM>')
    .replace(/"[^"]*"/g, '"<STR>"')
    .slice(0, 200);

  const topFrame =
    stackTrace
      ?.split('\n')
      .find(
        (line) =>
          line.trim().startsWith('at ') ||
          /File ".+", line/.test(line.trim()),
      )
      ?.replace(/:\d+:\d+/g, ':<L>:<C>')
      ?.replace(/line \d+/g, 'line <L>')
      ?.trim() ?? '';

  const raw = `${service}|${errorType}|${normalizedMessage}|${topFrame}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

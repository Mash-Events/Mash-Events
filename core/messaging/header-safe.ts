// Header-safe text for email subjects and addresses: strips CR/LF so
// user-controlled values can never split or inject headers (CRLF
// injection). Everything user-entered that reaches a header goes through
// this first. Pure module — no server-only guard, so tests import it
// directly.

export function headerSafe(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

/** Escapes XML text emitted in payroll exports. */

/** Escapes text before it is embedded in the payroll XML export. */
export function escapeXml(value: string): string {
  const escaped: string[] = [];
  for (const character of value) {
    switch (character) {
      case '&':
        escaped.push('&amp;');
        break;
      case '<':
        escaped.push('&lt;');
        break;
      case '>':
        escaped.push('&gt;');
        break;
      case '"':
        escaped.push('&quot;');
        break;
      case "'":
        escaped.push('&apos;');
        break;
      default:
        escaped.push(character);
    }
  }
  return escaped.join('');
}

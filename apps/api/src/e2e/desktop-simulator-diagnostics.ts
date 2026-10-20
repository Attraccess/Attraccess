/** Retained text is diagnostic evidence, never a copy of credential-bearing controls. */
export class DesktopDiagnostics {
  private readonly secrets = new Set<string>();

  remember(...values: (string | undefined)[]) {
    for (const value of values) if (value) this.secrets.add(value);
  }

  sanitize(text: string): string {
    // Drop the whole line, including unknown values associated with sensitive fields.
    let safe = text
      .split('\n')
      .map((line) =>
        /pin|passcode|password|passwort|credential|token|secret|authorization|payload|key|schlüssel|\{\s*"/i.test(line)
          ? '[redacted]'
          : line,
      )
      .join('\n');
    for (const secret of this.secrets) safe = safe.split(secret).join('[redacted]');
    // PINs are remembered above; treating every four-digit number as a PIN would
    // also reject the display's date. Exclude unlabelled keys and bearer-shaped values.
    return safe.replace(/\b[a-zA-Z0-9_+/-]{24,}={0,2}(?:\.[a-zA-Z0-9_+/-]+={0,2})*/g, '[redacted]');
  }

  assertScreenshotSafe(screen: string, labels: string[]) {
    if (/settings|pin|credential/i.test(screen) || labels.some((label) => this.sanitize(label) !== label))
      throw new Error('Refusing to retain a screenshot with potentially sensitive content');
  }
}

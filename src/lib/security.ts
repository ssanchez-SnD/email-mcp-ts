const SECRET_PATTERNS = [
  /(\bAPI_KEY\s*=\s*)([^\s]+)/gi,
  /(\bIMAP_PASSWORD\s*=\s*)([^\s]+)/gi,
  /(\bSMTP_PASSWORD\s*=\s*)([^\s]+)/gi,
  /(\bSMTP_USERNAME\s*=\s*)([^\s]+)/gi
];

export function redactSecrets(input: string, secrets: string[] = []) {
  let output = input;

  for (const secret of secrets.filter(Boolean)) {
    output = output.split(secret).join('[redacted]');
  }

  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '$1[redacted]');
  }

  return output;
}

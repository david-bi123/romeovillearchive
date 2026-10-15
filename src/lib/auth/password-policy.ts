export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "password123",
  "password1234",
  "1234567890",
  "12345678901",
  "qwerty123456",
  "welcome1234",
  "admin1234567",
  "iloveyou1234",
  "letmein12345",
  "changeme1234",
]);

/** Rejects obviously weak passwords. Returns a list of failure messages. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`must be at most ${PASSWORD_MAX_LENGTH} characters long`);
  }
  if (!/[a-z]/i.test(password)) problems.push("must contain at least one letter");
  if (!/\d/.test(password)) problems.push("must contain at least one number");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push("is too common, please choose something less guessable");
  }
  if (password.trim() !== password) problems.push("must not start or end with whitespace");
  return problems;
}

export function isStrongPassword(password: string): boolean {
  return passwordProblems(password).length === 0;
}

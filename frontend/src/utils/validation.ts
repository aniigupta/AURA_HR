// Mirrors backend/app/schemas/schemas.py's validate_password_strength — keep
// these in sync. Client-side check exists purely for instant feedback; the
// backend is the actual source of truth and re-validates independently.
export function getPasswordStrengthError(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one digit.";
  }
  return null;
}

import type { FieldErrors } from "./types";

export function validate(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (firstName !== undefined && !firstName.trim()) {
    errors.first_name = "First name is required";
  }

  if (!email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Invalid email address";
  }

  if (password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  return errors;
}

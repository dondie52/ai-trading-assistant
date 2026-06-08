export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface RegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const validateEmail = (email: string): ValidationResult => {
  const normalized = normalizeEmail(email);
  return emailPattern.test(normalized)
    ? { valid: true, errors: [] }
    : { valid: false, errors: ["Email must be a valid address."] };
};

export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];

  if (password.length < 10) {
    errors.push("Password must be at least 10 characters.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include an uppercase letter.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must include a lowercase letter.");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must include a number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must include a symbol.");
  }

  return { valid: errors.length === 0, errors };
};

export const validateRegistration = (input: RegistrationInput): ValidationResult => {
  const email = validateEmail(input.email);
  const password = validatePassword(input.password);
  const errors = [...email.errors, ...password.errors];

  if (input.firstName !== undefined && input.firstName.trim().length > 80) {
    errors.push("First name must be 80 characters or fewer.");
  }

  if (input.lastName !== undefined && input.lastName.trim().length > 80) {
    errors.push("Last name must be 80 characters or fewer.");
  }

  return { valid: errors.length === 0, errors };
};

export const validateLogin = (email: string, password: string): ValidationResult => {
  const errors: string[] = [];

  if (!validateEmail(email).valid) {
    errors.push("Email must be a valid address.");
  }

  if (password.length === 0) {
    errors.push("Password is required.");
  }

  return { valid: errors.length === 0, errors };
};


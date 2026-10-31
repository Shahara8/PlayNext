import { z } from "zod";

export const signUpSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Supabase returns plain-English `AuthError.message` strings with no stable
// error code for several common cases — matched here so the UI can show a
// clearer message than the raw string (and translate a couple that would
// otherwise be confusing out of context, like "Email not confirmed").
export function friendlyAuthErrorMessage(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (message.includes("User already registered")) {
    return "An account with this email already exists — try signing in instead.";
  }
  if (message.includes("Email not confirmed")) {
    return "Please confirm your email before signing in — check your inbox for the confirmation link.";
  }
  return message;
}

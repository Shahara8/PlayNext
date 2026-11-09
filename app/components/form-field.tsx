import { useId, type ComponentProps } from "react";
import FormMessage from "./form-message";
import styles from "./login-form.module.css";

/**
 * A labeled .input with its own error line right under it (a validation
 * problem about this field, e.g. a short password), tied to the input with
 * aria-invalid and aria-describedby so a screen reader reads it with the
 * field. Errors that aren't about one field stay in the form's own
 * FormMessage above the submit button.
 */
export default function FormField({
  label,
  error,
  ...input
}: { label: string; error?: string | null } & ComponentProps<"input">) {
  const errorId = useId();
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.field}>
        {label}
        <input
          {...input}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <FormMessage kind="error" id={errorId}>
          {error}
        </FormMessage>
      )}
    </div>
  );
}

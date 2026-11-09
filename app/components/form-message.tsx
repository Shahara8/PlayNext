import styles from "./form-message.module.css";

/**
 * A form's error (in --danger, announced at once) or confirmation (in
 * --success, announced politely), each with an icon so color isn't the only
 * signal. Used by the sign-in and reset-password forms.
 */
export default function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "info";
  children: React.ReactNode;
}) {
  const error = kind === "error";
  return (
    <p
      className={`${styles.message} ${error ? styles.error : styles.info}`}
      role={error ? "alert" : "status"}
      data-form-message={kind}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="10" cy="10" r="8" />
        {error ? (
          <path d="M10 5.75v5M10 14.1v.15" />
        ) : (
          <path d="m6.5 10.25 2.4 2.4 4.6-4.9" />
        )}
      </svg>
      <span>{children}</span>
    </p>
  );
}

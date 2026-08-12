"use client";

import { useEffect, useRef, type RefObject } from "react";
import { focusFormError } from "./form-error-focus";
import styles from "./FormErrorSummary.module.css";

export function FormErrorSummary({
  id,
  message,
  formRef,
  className,
}: {
  id: string;
  message: string;
  formRef: RefObject<HTMLFormElement | null>;
  className: string;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) {
      focusFormError(formRef.current, summaryRef.current);
    }
  }, [formRef, message]);

  return (
    <div
      id={id}
      ref={summaryRef}
      className={`${styles.summary} ${className}`}
      role="alert"
      aria-atomic="true"
      tabIndex={-1}
    >
      {message ? (
        <>
          <strong>There was a problem.</strong>
          <span>{message}</span>
        </>
      ) : null}
    </div>
  );
}

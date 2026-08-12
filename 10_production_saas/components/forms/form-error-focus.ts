export const INVALID_FORM_CONTROL_SELECTOR =
  'input:invalid, select:invalid, textarea:invalid, [aria-invalid="true"]';

type Focusable = {
  focus(): void;
};

type InvalidControlContainer = {
  querySelector(selector: string): Focusable | null;
};

export type FormErrorFocusTarget =
  | "invalid-control"
  | "error-summary"
  | "none";

export function focusFormError(
  form: InvalidControlContainer | null,
  summary: Focusable | null,
): FormErrorFocusTarget {
  const invalidControl = form?.querySelector(INVALID_FORM_CONTROL_SELECTOR);
  if (invalidControl) {
    invalidControl.focus();
    return "invalid-control";
  }
  if (summary) {
    summary.focus();
    return "error-summary";
  }
  return "none";
}

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string) => ReactNode;
}

function FieldWrapper({ label, hint, error, children }: FieldWrapperProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function TextField({ label, hint, error, ...rest }: TextFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id) => <input id={id} className={inputClass} {...rest} />}
    </FieldWrapper>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string | null;
  options: Array<{ value: string; label: string }>;
}

export function SelectField({
  label,
  hint,
  error,
  options,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id) => (
        <select id={id} className={inputClass} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldWrapper>
  );
}

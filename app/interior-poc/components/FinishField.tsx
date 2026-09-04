interface FinishFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

export default function FinishField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: FinishFieldProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field-shell w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text)] outline-none"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

import { WarningCircle } from "@/components/icons";

export function AuthFormAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="notice notice-fault mt-4 flex items-start gap-3 p-3">
      <WarningCircle className="notice-ink mt-0.5 size-4 shrink-0" />
      <p className="text-sm leading-snug">{message}</p>
    </div>
  );
}


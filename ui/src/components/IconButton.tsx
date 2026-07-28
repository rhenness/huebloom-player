import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  /** Screen-reader label and native tooltip for this icon-only control. */
  label: string;
  icon: ReactNode;
  /** Sets aria-pressed and the selected treatment when supplied. */
  active?: boolean;
  size?: "small" | "medium" | "large";
  tooltip?: string;
}

/** A consistently sized, accessible icon-only button. */
export function IconButton({
  active,
  className,
  icon,
  label,
  size = "medium",
  tooltip,
  type,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      aria-pressed={active}
      className={["icon-button", `icon-button--${size}`, active ? "is-active" : "", className]
        .filter(Boolean)
        .join(" ")}
      title={tooltip ?? label}
      type={type ?? "button"}
    >
      {icon}
    </button>
  );
}

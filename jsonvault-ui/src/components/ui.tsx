"use client";

import { Check, Copy, Info, X } from "lucide-react";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
} from "react";
import { copyToClipboard } from "@/lib/utils";

export function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
      aria-label="Copy to clipboard"
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${className}`}
    >
      {copied ? (
        <Check size={14} className="text-emerald-500" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

export function CodeBlock({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={`relative group rounded-lg bg-white dark:bg-[#161616] border border-zinc-200 dark:border-white/10 overflow-hidden ${className}`}
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton
          text={children}
          className="bg-zinc-800/80 backdrop-blur border border-zinc-200 dark:border-white/5"
        />
      </div>
      <pre className="text-zinc-700 dark:text-zinc-300 font-mono text-[13px] leading-relaxed p-4 overflow-x-auto selection:bg-zinc-700">
        {children}
      </pre>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/50 ${className}`}
    />
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  const columns = "abcdefghijklmnopqrstuvwxyz".slice(0, cols).split("");
  return (
    <tr className="border-b border-zinc-200 dark:border-white/5">
      {columns.map((column) => (
        <td key={column} className="px-5 py-3.5">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-200 dark:border-white/5 flex items-center justify-center text-zinc-500 mb-2 shadow-inner">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
          {title}
        </p>
        <p className="text-[13px] text-zinc-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const styles: Record<string, string> = {
    success:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    warning:
      "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    danger:
      "bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    info: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    neutral:
      "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-white/5",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function CheckboxControl({
  checked,
  onChange,
  label,
  description,
  className = "",
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-left text-[13px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={`mt-0.5 w-4 h-4 rounded border grid place-items-center leading-none shrink-0 ${
          checked
            ? "bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-black"
            : "border-zinc-300 dark:border-zinc-600"
        }`}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description && (
          <span className="text-[12px] text-zinc-500 leading-relaxed">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export function SelectionCheckbox({
  checked,
  mixed = false,
  onClick,
  label,
  disabled = false,
  checkedIcon = "check",
}: {
  checked: boolean;
  mixed?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  checkedIcon?: "check" | "dash";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`size-4 shrink-0 rounded-[3px] border grid place-items-center leading-none transition-colors ${
        checked || mixed
          ? "bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-black"
          : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 dark:hover:border-zinc-400"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {checked && checkedIcon === "check" ? (
        <Check size={11} strokeWidth={3} />
      ) : checked || mixed ? (
        <span className="h-0.5 w-2 rounded-full bg-current" />
      ) : null}
    </button>
  );
}

export function InfoTooltip({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex group ${className}`}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Info size={14} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 absolute right-0 top-full z-[90] mt-2 w-72 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1c1c1c] p-3 text-left text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300 shadow-xl transition-opacity"
      >
        {label}
      </span>
    </span>
  );
}

export function Alert({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning" | "danger" | "success";
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/5 dark:border-blue-500/20 dark:text-blue-300",
    warning:
      "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/5 dark:border-amber-500/20 dark:text-amber-300",
    danger:
      "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/5 dark:border-red-500/20 dark:text-red-300",
    success:
      "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/5 dark:border-emerald-500/20 dark:text-emerald-300",
  };
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border text-[13px] leading-relaxed shadow-sm ${styles[variant]}`}
    >
      {children}
    </div>
  );
}

export function ToastNotice({
  message,
  variant = "success",
  onClose,
}: {
  message: string;
  variant?: "info" | "warning" | "danger" | "success";
  onClose: () => void;
}) {
  const styles: Record<typeof variant, string> = {
    info: "border-blue-200 bg-white text-zinc-900 dark:border-blue-500/20 dark:bg-[#161616] dark:text-zinc-100",
    warning:
      "border-amber-200 bg-white text-zinc-900 dark:border-amber-500/20 dark:bg-[#161616] dark:text-zinc-100",
    danger:
      "border-red-200 bg-white text-zinc-900 dark:border-red-500/20 dark:bg-[#161616] dark:text-zinc-100",
    success:
      "border-emerald-200 bg-white text-zinc-900 dark:border-emerald-500/20 dark:bg-[#161616] dark:text-zinc-100",
  };
  const dot: Record<typeof variant, string> = {
    info: "bg-blue-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    success: "bg-emerald-500",
  };

  return (
    <div
      className={`fixed top-16 right-4 z-[70] w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border shadow-xl animate-in slide-in-from-right-4 fade-in duration-200 ${styles[variant]}`}
    >
      <div className="flex items-start gap-3 p-4">
        <span className={`mt-1.5 w-2 h-2 rounded-full ${dot[variant]}`} />
        <p className="flex-1 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {message}
        </p>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const sizeClass =
    size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#000000]/60 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        aria-modal="true"
        className={`relative bg-white dark:bg-[#1c1c1c] rounded-xl border border-zinc-200 dark:border-white/10 shadow-2xl flex flex-col max-h-[90vh] w-full ${sizeClass} animate-in fade-in zoom-in-95 duration-200`}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 dark:border-white/5 shrink-0">
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-5 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 dark:border-white/5 bg-white dark:bg-[#161616] rounded-b-xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function SidePanel({
  title,
  onClose,
  children,
  footer,
  size = "md",
  hasUnsavedChanges = false,
  discardTitle = "Discard unsaved changes?",
  discardDescription = "This panel has draft changes that have not been saved.",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  hasUnsavedChanges?: boolean;
  discardTitle?: string;
  discardDescription?: React.ReactNode;
}) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const sizeClass =
    size === "xl"
      ? "max-w-[760px]"
      : size === "lg"
        ? "max-w-[640px]"
        : "max-w-[520px]";

  function requestClose() {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-50">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-black/20"
        onClick={requestClose}
        tabIndex={-1}
      />
      <aside
        aria-modal="true"
        className={`absolute right-0 top-0 bottom-0 w-full ${sizeClass} overflow-hidden bg-white dark:bg-[#161616] border-l border-zinc-200 dark:border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-200`}
        onKeyDown={(event) => event.key === "Escape" && requestClose()}
        role="dialog"
        tabIndex={-1}
      >
        <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#161616]">
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close panel"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-6 pb-20 flex flex-col gap-5">
          {children}
        </div>
        {footer && (
          <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 px-6 py-4 border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] shrink-0">
            <div className="min-w-0" />
            <div className="flex items-center justify-end gap-3 shrink-0">
              {footer}
            </div>
          </div>
        )}
      </aside>
      {showDiscardConfirm && (
        <ConfirmModal
          title={discardTitle}
          description={
            typeof discardDescription === "string" ? (
              <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {discardDescription}
              </p>
            ) : (
              discardDescription
            )
          }
          confirmLabel="Discard changes"
          danger
          onClose={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-[13px] font-medium border border-zinc-200 dark:border-white/10 bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md text-[13px] font-medium transition-colors shadow-sm ${
              danger
                ? "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                : "bg-zinc-900 text-white dark:bg-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200"
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[14px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {description}
      </div>
    </Modal>
  );
}

// Supabase-style primary button
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ElementType;
};

export function PrimaryButton({
  children,
  className = "",
  icon: Icon,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium bg-zinc-900 text-white dark:bg-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm ${className}`}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
}

// Supabase-style secondary button
export function SecondaryButton({
  children,
  className = "",
  icon: Icon,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
}

// Custom Dropdown
const DropdownCloseContext = createContext<(() => void) | null>(null);

export function Dropdown({
  trigger,
  children,
  align = "right",
  direction = "down",
  fullWidth = false,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  direction?: "down" | "up";
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  function toggleOpen() {
    setOpen((current) => !current);
  }
  const triggerElement = isValidElement<{
    onClick?: React.MouseEventHandler;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: "menu";
  }>(trigger) ? (
    cloneElement(trigger, {
      "aria-expanded": open,
      "aria-haspopup": "menu",
      onClick: (event) => {
        trigger.props.onClick?.(event);
        toggleOpen();
      },
    })
  ) : (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={toggleOpen}
    >
      {trigger}
    </button>
  );

  return (
    <div
      className={`relative ${fullWidth ? "block w-full" : "inline-block"} text-left`}
    >
      <div className={fullWidth ? "w-full" : ""}>{triggerElement}</div>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <DropdownCloseContext.Provider value={() => setOpen(false)}>
            <div
              className={`absolute z-50 rounded-md bg-white dark:bg-[#1c1c1c] border border-zinc-200 dark:border-white/10 shadow-lg py-1 animate-in fade-in duration-200 
              ${align === "right" ? "right-0" : "left-0"}
              ${direction === "up" ? "bottom-full mb-2 slide-in-from-bottom-2" : "top-full mt-2 slide-in-from-top-2"}
              ${fullWidth ? "w-full min-w-0" : "min-w-[200px]"}
            `}
              onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
              role="menu"
            >
              {children}
            </div>
          </DropdownCloseContext.Provider>
        </>
      )}
    </div>
  );
}

type DropdownItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ElementType;
  danger?: boolean;
};

export function DropdownItem({
  children,
  onClick,
  icon: Icon,
  danger = false,
  ...props
}: DropdownItemProps) {
  const closeDropdown = useContext(DropdownCloseContext);
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        closeDropdown?.();
      }}
      {...props}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="h-px bg-zinc-200 dark:bg-white/5 my-1" />;
}

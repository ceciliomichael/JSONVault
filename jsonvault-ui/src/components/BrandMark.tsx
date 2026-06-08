import Image from "next/image";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md";
};

export function BrandMark({ className = "", size = "sm" }: BrandMarkProps) {
  const sizeClass = size === "md" ? "w-8 h-8" : "w-6 h-6";
  const pixels = size === "md" ? 32 : 24;

  return (
    <span aria-hidden="true" className={`${sizeClass} shrink-0 ${className}`}>
      <Image
        src="/favicon.svg"
        alt=""
        width={pixels}
        height={pixels}
        unoptimized
        className="h-full w-full object-contain"
      />
    </span>
  );
}

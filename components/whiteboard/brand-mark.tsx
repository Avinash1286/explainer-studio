import { cn } from "@/lib/utils";

/** Chalk's iris mark, ported from the supplied interface. Give repeated marks
 * distinct IDs so their SVG paint references remain valid in one document. */
export function BrandMark({ className, size = 28, id = "chalk-brand" }: { className?: string; size?: number; id?: string }) {
  const gradientId = `${id}-aperture`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gradientId} cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="55%" stopColor="#cfd3da" />
          <stop offset="100%" stopColor="#9aa1ad" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${gradientId})`} stroke="#8a909b" strokeWidth="1.5" />
      <g transform="translate(50 50)">
        {Array.from({ length: 8 }, (_, index) => (
          <path key={index} d="M0,-36 A36,36 0 0,1 25.5,-25.5 L6,-6 A9,9 0 0,0 0,-9 Z" fill="#e7e9ee" stroke="#aab0ba" strokeWidth="0.8" transform={`rotate(${index * 45})`} opacity={0.92} />
        ))}
        <circle r="16" fill="#1f2430" />
        <circle cx="6" cy="-5" r="4.5" fill="#f6f7f9" opacity="0.9" />
      </g>
    </svg>
  );
}

import { useId } from "react";

/** ZamWriter's mark: a ghostwriter. Same artwork as favicon.svg. */
export function Logo({ size = 28 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset=".55" stopColor="#db2777" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradient})`} />
      <path d="M26.2 4.6l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55z" fill="#fff" opacity=".9" />
      <g transform="rotate(38 23.5 16.5)">
        <rect x="22.2" y="9" width="2.6" height="10" rx=".6" fill="#facc15" />
        <rect x="22.2" y="9" width="2.6" height="1.8" rx=".6" fill="#fda4af" />
        <path d="M22.2 19h2.6l-1.3 2.6z" fill="#fde68a" />
        <path d="M23.05 20.7h.9l-.45.9z" fill="#1e1b4b" />
      </g>
      <path d="M7.5 14.5a7.5 7.5 0 0 1 15 0v10.2q-1.25 2.2-2.5 0t-2.5 0-2.5 0-2.5 0-2.5 0-2.5 0z" fill="#fff" />
      <circle cx="21.6" cy="19.3" r="1.55" fill="#fff" />
      <ellipse cx="12.4" cy="15" rx="1.15" ry="1.55" fill="#2e1065" />
      <ellipse cx="17.6" cy="15" rx="1.15" ry="1.55" fill="#2e1065" />
      <circle cx="10.6" cy="18" r="1.1" fill="#fb7185" opacity=".5" />
      <circle cx="19.4" cy="18" r="1.1" fill="#fb7185" opacity=".5" />
      <path d="M13.6 18.1q1.4 1.2 2.8 0" fill="none" stroke="#2e1065" strokeWidth=".9" strokeLinecap="round" />
    </svg>
  );
}

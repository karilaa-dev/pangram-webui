/** ZamWriter's mark: a ghost(writer). Same shape as favicon.svg, in the theme's brand color. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} className="shrink-0">
      <rect width="32" height="32" rx="8" className="fill-kumo-brand" />
      <path d="M9 13.5a7 7 0 0 1 14 0V24q-2.33 2.4-4.67 0-2.33 2.4-4.66 0-2.34 2.4-4.67 0z" fill="#fff" />
      <circle cx="13.3" cy="14" r="1.5" className="fill-kumo-brand" />
      <circle cx="18.7" cy="14" r="1.5" className="fill-kumo-brand" />
    </svg>
  );
}

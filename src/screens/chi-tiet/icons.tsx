import type { ReactNode, SVGProps } from 'react'

const paths: Record<string, ReactNode> = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  wallet: <path d="M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h12M16 14h2" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />,
  plus: <path d="M12 5v14M5 12h14" />,
}

export function Glyph({ name, label, ...props }: { name: keyof typeof paths; label?: string } & SVGProps<SVGSVGElement>) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} {...props}>{paths[name]}</svg>
}

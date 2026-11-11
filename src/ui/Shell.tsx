'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  ['/', 'Today'],
  ['/gym/', 'My gym'],
  ['/goals/', 'Goals'],
  ['/library/', 'Exercises'],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const here = (href: string) => (href === '/' ? path === '/' : path.startsWith(href.replace(/\/$/, '')));
  return (
    <div className="shell">
      <header className="top">
        <Link href="/" className="brand">
          <span className="logo" />
          Gym Coach
        </Link>
        <nav>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={here(href) ? 'on' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/train/" className="btn primary small">
          Train
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}

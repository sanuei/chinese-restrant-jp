// Root layout — required by Next.js App Router
// All page content renders inside this file's {children}
// locale-specific layout is at src/app/[locale]/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

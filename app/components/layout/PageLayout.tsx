// app/components/layout/PageLayout.tsx
import { Header } from '~/components/header/Header';

interface PageLayoutProps {
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      <Header />
      <main className="container mx-auto px-4 py-8 md:py-12 lg:py-16">
        {children}
      </main>
    </div>
  );
}

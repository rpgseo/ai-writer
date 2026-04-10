import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  currentPath: string;
  projectId?: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export function Layout({ children, currentPath, projectId, onNavigate, onLogout }: LayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar
        currentPath={currentPath}
        projectId={projectId}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <main className="flex-1 ml-64">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { ProjectOverview } from './pages/ProjectOverview';
import { Pipeline } from './pages/Pipeline';
import { Articles } from './pages/Articles';
import { ArticleDetail } from './pages/ArticleDetail';
import { TopicalMap } from './pages/TopicalMap';
import { LinkGraph } from './pages/LinkGraph';
import { api } from './lib/api-client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(api.isAuthenticated());
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    window.history.pushState({}, '', path);
  }, []);

  const handleLogout = useCallback(() => {
    api.clearApiKey();
    setIsAuthenticated(false);
    queryClient.clear();
    handleNavigate('/');
  }, [handleNavigate]);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  // Extract project ID from path
  const projectMatch = currentPath.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  const renderPage = () => {
    if (currentPath === '/settings') {
      return <Settings />;
    }

    if (currentPath === '/' || currentPath === '') {
      return <Dashboard onNavigate={handleNavigate} />;
    }

    if (projectId) {
      const subPath = currentPath.replace(`/projects/${projectId}`, '') || '/overview';

      // Check for article detail route: /articles/:articleId
      const articleDetailMatch = subPath.match(/^\/articles\/(.+)$/);
      if (articleDetailMatch && articleDetailMatch[1] !== '') {
        return (
          <ArticleDetail
            projectId={projectId}
            articleId={articleDetailMatch[1]}
            onNavigate={handleNavigate}
          />
        );
      }

      switch (subPath) {
        case '/overview':
          return <ProjectOverview projectId={projectId} onNavigate={handleNavigate} />;
        case '/pipeline':
          return <Pipeline projectId={projectId} />;
        case '/articles':
          return <Articles projectId={projectId} onNavigate={handleNavigate} />;
        case '/topical-map':
          return <TopicalMap projectId={projectId} onNavigate={handleNavigate} />;
        case '/links':
          return <LinkGraph projectId={projectId} />;
        case '/discovery':
          return <PlaceholderPage title="Site Discovery" description="Run the Discovery phase in the Pipeline to crawl your website." />;
        case '/gsc':
          return <PlaceholderPage title="GSC Intelligence" description="Connect GSC and run the GSC Intelligence phase to analyze keywords." />;
        case '/calendar':
          return <PlaceholderPage title="Content Calendar" description="Content briefs will appear here after running Content Planning." />;
        default:
          return <PlaceholderPage title="Not Found" description="Page not found." />;
      }
    }

    return <Dashboard onNavigate={handleNavigate} />;
  };

  return (
    <Layout
      currentPath={currentPath}
      projectId={projectId}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {renderPage()}
    </Layout>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="card text-center py-16">
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

interface SidebarProps {
  currentPath: string;
  projectId?: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

const mainNav = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

const projectNav = [
  { path: '/overview', label: 'Overview', icon: '📋' },
  { path: '/discovery', label: 'Site Discovery', icon: '🔍' },
  { path: '/gsc', label: 'GSC Data', icon: '📈' },
  { path: '/topical-map', label: 'Topical Map', icon: '🗺️' },
  { path: '/calendar', label: 'Content Calendar', icon: '📅' },
  { path: '/articles', label: 'Articles', icon: '📝' },
  { path: '/links', label: 'Internal Links', icon: '🔗' },
  { path: '/pipeline', label: 'Pipeline', icon: '⚡' },
];

export function Sidebar({ currentPath, projectId, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 h-screen fixed left-0 top-0 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-brand-400">AI Writer</h1>
        <p className="text-xs text-gray-500 mt-1">SEO Content Engine</p>
      </div>

      {/* Main navigation */}
      <nav className="p-4 flex-1 overflow-y-auto">
        <div className="space-y-1">
          {mainNav.map((item) => (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentPath === item.path
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Project navigation */}
        {projectId && (
          <>
            <div className="mt-6 mb-2 px-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Project
              </p>
            </div>
            <div className="space-y-1">
              {projectNav.map((item) => {
                const fullPath = `/projects/${projectId}${item.path}`;
                return (
                  <button
                    key={item.path}
                    onClick={() => onNavigate(fullPath)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      currentPath === fullPath
                        ? 'bg-brand-500/20 text-brand-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* Footer with logout */}
      <div className="p-4 border-t border-gray-800 flex items-center justify-between">
        <span className="text-xs text-gray-600">v0.1.0</span>
        <button
          onClick={onLogout}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

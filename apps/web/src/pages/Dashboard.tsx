import { useState, type FormEvent } from 'react';
import { useProjects, useCreateProject, useDeleteProject } from '../hooks/useProjects';
import type { Project } from '@ai-writer/shared';

interface DashboardProps {
  onNavigate: (path: string) => void;
}

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function Dashboard({ onNavigate }: DashboardProps) {
  const { data: projects, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ domain: '', name: '', language: navigator.language?.split('-')[0] || 'es' });
  const [formError, setFormError] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (createProject.isPending) return;

    // Validate domain
    const cleanDomain = formData.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!DOMAIN_REGEX.test(cleanDomain)) {
      setFormError('Invalid domain format. Example: example.com');
      return;
    }

    setFormError('');
    try {
      const project = await createProject.mutateAsync({ ...formData, domain: cleanDomain });
      setShowForm(false);
      setFormData({ domain: '', name: '', language: navigator.language?.split('-')[0] || 'es' });
      onNavigate(`/projects/${project.id}/overview`);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  if (isLoading) {
    return <div className="text-gray-400">Loading projects...</div>;
  }

  if (error) {
    return <div className="text-red-400">Error loading projects: {(error as Error).message}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage your SEO content projects</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          + New Project
        </button>
      </div>

      {/* New Project Form */}
      {showForm && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Create New Project</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="domain">Domain</label>
                <input
                  id="domain"
                  type="text"
                  className="input"
                  placeholder="example.com"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  pattern="^(https?://)?[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}.*$"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="name">Project Name</label>
                <input
                  id="name"
                  type="text"
                  className="input"
                  placeholder="My Website"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  maxLength={200}
                  required
                />
              </div>
            </div>
            <div className="w-48">
              <label className="label" htmlFor="language">Language</label>
              <select
                id="language"
                className="input"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              >
                <option value="es">Spanish</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="it">Italian</option>
              </select>
            </div>
            {formError && (
              <div className="text-sm text-red-400 bg-red-500/10 px-4 py-2 rounded-lg">
                {formError}
              </div>
            )}
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={createProject.isPending}>
                {createProject.isPending ? 'Creating...' : 'Create Project'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects Grid */}
      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project: Project) => (
            <button
              key={project.id}
              className="card hover:border-brand-500/50 cursor-pointer transition-colors group text-left w-full"
              onClick={() => onNavigate(`/projects/${project.id}/overview`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg group-hover:text-brand-400 transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{project.domain}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  project.gsc_connected
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {project.gsc_connected ? 'GSC Connected' : 'No GSC'}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                <span>{project.language?.toUpperCase()}</span>
                <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
              </div>

              {/* Quick actions */}
              <div className="mt-4 pt-4 border-t border-gray-800 flex gap-2">
                <span
                  role="link"
                  className="text-xs text-gray-400 hover:text-brand-400 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(`/projects/${project.id}/pipeline`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      onNavigate(`/projects/${project.id}/pipeline`);
                    }
                  }}
                  tabIndex={0}
                >
                  Run Pipeline
                </span>
                <span className="text-gray-700">|</span>
                <span
                  role="button"
                  className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this project?')) {
                      deleteProject.mutateAsync(project.id).catch(console.error);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      if (confirm('Delete this project?')) {
                        deleteProject.mutateAsync(project.id).catch(console.error);
                      }
                    }
                  }}
                  tabIndex={0}
                >
                  Delete
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">No projects yet</p>
          <p className="text-gray-500 text-sm mt-2">Create your first project to get started</p>
          <button
            className="btn-primary mt-4"
            onClick={() => setShowForm(true)}
          >
            + Create Project
          </button>
        </div>
      )}
    </div>
  );
}

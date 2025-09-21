'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { PersonSelector } from '@/components/ui/person-selector';
import { Document } from '@/types';
import DocumentUploadModal from '@/components/documents/document-upload-modal';
import { useRouter } from 'next/navigation';
import {
  Search,
  Star,
  Clock,
  Upload,
  Download,
  Eye,
  Trash2,
  ChevronDown,
  Grid3X3,
  List,
  FileText,
  Calendar,
  Filter,
  X,
  Copy,
  CopyCheck,
} from 'lucide-react';
import { formatBytes, formatDate } from '@/lib/utils';
import { DocumentCard } from '@/components/documents/document-card';
import {
  DOCUMENT_CATEGORY_OPTIONS,
  buildAssignedSummary,
  cleanDocumentTitle,
  formatSourcePage,
  getDaysUntilExpiration,
  getDocumentCategoryBadge,
  getDocumentRelatedNames,
  getFileIcon,
} from '@/components/documents/document-helpers';
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal';
import { useDocumentActions } from '@/hooks/useDocumentActions';
import { useDocumentPreview } from '@/hooks/useDocumentPreview';

const categories = DOCUMENT_CATEGORY_OPTIONS;

const sortOptions = [
  { id: 'newest', name: 'Newest First' },
  { id: 'oldest', name: 'Oldest First' },
  { id: 'a-z', name: 'A to Z' },
  { id: 'z-a', name: 'Z to A' },
  { id: 'largest', name: 'Largest Size' },
  { id: 'smallest', name: 'Smallest Size' },
  { id: 'expiring', name: 'Expiring Soon' }
];

export default function DocumentsPage() {
  const { user, loading: userLoading } = useUser();
  const { selectedPersonId } = usePersonFilter();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState({
    starred: false,
    expiringSoon: false,
    showArchived: false,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [familyMemberMap, setFamilyMemberMap] = useState<Record<string, string>>({ shared: 'Shared/Family' });
  const [copyingDocId, setCopyingDocId] = useState<string | null>(null);
  const { copyLink, viewDocument, downloadDocument, deleteDocument, toggleStar } = useDocumentActions();
  const {
    doc: previewDoc,
    signedUrl: previewUrl,
    loading: previewLoading,
    error: previewError,
    openPreview,
    closePreview,
  } = useDocumentPreview();

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    storageUsed: 0,
    expiringSoon: 0,
    recentUploads: 0
  });

  useEffect(() => {
    if (!userLoading && user) {
      fetchDocuments();
      fetchFamilyMembers();
    } else if (!userLoading && !user) {
      setLoading(false);
    }
  }, [user, userLoading, selectedPersonId, filters.showArchived]);

  useEffect(() => {
    filterAndSortDocuments();
  }, [documents, selectedCategory, searchQuery, filters, sortBy]);

  const fetchDocuments = async () => {
    try {
      let url = '/api/documents';
      const params = new URLSearchParams();
      if (selectedPersonId) params.append('selected_person', selectedPersonId);
      if (filters.showArchived) params.append('show_archived', 'true');
      
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        calculateStats(data.documents || []);
      } else {
        console.error('Failed to fetch documents');
        setDocuments([]);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFamilyMembers = async () => {
    try {
      const response = await fetch('/api/family-members');
      if (!response.ok) return;
      const data = await response.json();
      const members = data.members || [];
      const map: Record<string, string> = { shared: 'Shared/Family' };
      members.forEach((member: any) => {
        const name = member.display_name || member.name || member.email || member.id;
        map[member.id] = name;
      });
      setFamilyMemberMap(map);
    } catch (error) {
      console.error('Failed to fetch family members for documents:', error);
    }
  };

  const calculateStats = (docs: Document[]) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    setStats({
      total: docs.length,
      storageUsed: docs.reduce((acc, doc) => acc + (doc.file_size || 0), 0),
      expiringSoon: docs.filter(doc => 
        doc.expiration_date && new Date(doc.expiration_date) <= thirtyDaysFromNow
      ).length,
      recentUploads: docs.filter(doc => 
        new Date(doc.created_at) >= sevenDaysAgo
      ).length
    });
  };

  const filterAndSortDocuments = () => {
    let filtered = [...documents];

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(doc => doc.category === selectedCategory);
    }

    // Person filtering is now handled by the API via selected_person parameter

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.title.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Quick filters
    if (filters.starred) {
      filtered = filtered.filter(doc => doc.is_starred);
    }
    if (filters.expiringSoon) {
      const thirtyDaysFromNow = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(doc => 
        doc.expiration_date && new Date(doc.expiration_date) <= thirtyDaysFromNow
      );
    }

    // Sort
    switch (sortBy) {
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'a-z':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'z-a':
        filtered.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'largest':
        filtered.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        break;
      case 'smallest':
        filtered.sort((a, b) => (a.file_size || 0) - (b.file_size || 0));
        break;
      case 'expiring':
        filtered.sort((a, b) => {
          if (!a.expiration_date && !b.expiration_date) return 0;
          if (!a.expiration_date) return 1;
          if (!b.expiration_date) return -1;
          return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        });
        break;
      default: // newest
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    setFilteredDocuments(filtered);
  };

  const handleStarToggle = async (doc: Document) => {
    try {
      await toggleStar(doc);
      setDocuments(prev => prev.map(d =>
        d.id === doc.id ? { ...d, is_starred: !d.is_starred } : d
      ));
    } catch (error) {
      console.error('Failed to update star status:', error);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return;

    try {
      await deleteDocument(doc);
      setDocuments(prev => {
        const updated = prev.filter(d => d.id !== doc.id);
        calculateStats(updated);
        return updated;
      });
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document. Please try again.');
    }
  };

  const handleView = async (doc: Document) => {
    try {
      await viewDocument(doc);
    } catch (error) {
      console.error('Failed to view document:', error);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc);
    } catch (error) {
      console.error('Failed to download document:', error);
    }
  };

  const copyDocumentLink = async (doc: Document) => {
    try {
      await copyLink(doc);
      setCopyingDocId(doc.id);
      setTimeout(() => setCopyingDocId(null), 2000);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const navigateToSource = (doc: Document) => {
    if (!doc.source_page || !doc.source_id) return;
    
    const routes: Record<string, string> = {
      'tasks': '/tasks',
      'travel': '/travel',
      'health': '/health',
      'calendar': '/calendar',
      'j3-academics': '/j3-academics',
      'pets': '/pets',
      'household': '/household'
    };

    if (routes[doc.source_page]) {
      router.push(`${routes[doc.source_page]}?id=${doc.source_id}`);
    }
  };

  if (loading || userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-muted">Please log in to view documents</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Documents Hub</h1>
        </div>
        
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Total Documents</div>
          <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Storage Used</div>
          <div className="text-2xl font-bold text-text-primary">
            {formatBytes(stats.storageUsed)}
          </div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-red-500">Expiring Soon</div>
          <div className="text-2xl font-bold text-red-500">{stats.expiringSoon}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-green-500">Recent Uploads</div>
          <div className="text-2xl font-bold text-green-500">{stats.recentUploads}</div>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="space-y-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search documents, tags, descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-background-secondary rounded-xl p-1 border border-gray-600/30">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'grid'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'list'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={
                'inline-flex items-center gap-2 px-4 py-1 rounded-xl border border-gray-600/30 bg-background-primary text-text-muted hover:text-text-primary hover:bg-gray-700/20 transition-colors'
              }
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-600/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Filter by
                  </label>
                  <PersonSelector className="w-full" showLabel={false} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {sortOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Quick Filters
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, starred: !prev.starred }))}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        filters.starred
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <Star className="h-4 w-4" fill={filters.starred ? 'currentColor' : 'none'} />
                      Starred
                    </button>
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, expiringSoon: !prev.expiringSoon }))}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        filters.expiringSoon
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      Expiring
                    </button>
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, showArchived: !prev.showArchived }))}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        filters.showArchived
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      Show Archived
                    </button>
                  </div>
                </div>
              </div>

              {/* Clear Filters */}
              {(selectedCategory !== 'all' || selectedPersonId || sortBy !== 'newest' || filters.starred || filters.expiringSoon || filters.showArchived || searchQuery) && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedCategory('all');
                      setSortBy('newest');
                      setFilters({ starred: false, expiringSoon: false, showArchived: false });
                      setSearchQuery('');
                    }}
                    className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Documents Display */}
      {filteredDocuments.length === 0 ? (
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-12">
          <div className="text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-600 mb-4" />
            <p className="text-text-muted">
              {searchQuery || selectedCategory !== 'all' || selectedPersonId || Object.values(filters).some(f => f)
                ? 'No documents match your filters'
                : 'No documents uploaded yet'}
            </p>
            {documents.length === 0 && (
              <p className="text-sm text-text-muted/70 mt-2">
                Click the Upload button to get started
              </p>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
          {filteredDocuments.map(doc => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              familyMemberMap={familyMemberMap}
              onCopy={copyDocumentLink}
              onView={handleView}
              onDownload={handleDownload}
              onDelete={user?.role === 'admin' ? handleDelete : undefined}
              onStarToggle={handleStarToggle}
              onOpen={openPreview}
            />
          ))}
        </div>
      ) : (
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-600/30">
              <tr>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Document</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Category</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Related To</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Uploaded</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Size</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600/30">
              {filteredDocuments.map(doc => {
                const relatedNames = getDocumentRelatedNames(doc, familyMemberMap);
                const sourceLabel = formatSourcePage(doc.source_page);
                const categoryBadge = getDocumentCategoryBadge(doc.category);
                const categoryClass = categoryBadge?.className ?? '';
                const categoryStyle = categoryBadge?.style;
                const expirationBadge = doc.expiration_date
                  ? getDaysUntilExpiration(doc.expiration_date)
                  : null;

                return (
                  <tr key={doc.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-gray-700/40 flex items-center justify-center text-text-primary">
                          {getFileIcon(doc.file_type)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary truncate">
                            <span className="truncate" title={cleanDocumentTitle(doc.title, doc.file_name)}>
                              {cleanDocumentTitle(doc.title, doc.file_name)}
                            </span>
                            {doc.is_starred && <Star className="h-4 w-4 text-yellow-500" fill="currentColor" />}
                          </div>
                        {expirationBadge !== null && (
                          <div className={`text-xs ${expirationBadge <= 30 ? 'text-red-400' : 'text-text-muted'}`}>
                            {expirationBadge > 0 ? `Expires in ${expirationBadge} days` : 'Expired'}
                          </div>
                        )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${categoryClass}`}
                      style={categoryStyle}
                    >
                      {categoryBadge?.name || doc.category}
                    </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="text-[#AB9BBF] font-medium">
                          {doc.source_page ? `From ${sourceLabel}` : 'Manual'}
                        </span>
                        {relatedNames.slice(0, 2).map(name => (
                          <span key={`${doc.id}-${name}`} className="px-2 py-0.5 rounded-full bg-gray-700/60 text-text-primary">
                            {name}
                          </span>
                        ))}
                        {relatedNames.length > 2 && (
                          <span className="text-text-muted">+{relatedNames.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-sm">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-sm">
                      {formatBytes(doc.file_size || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyDocumentLink(doc)}
                          className={`p-1.5 rounded text-text-muted hover:text-primary-400 transition-colors ${copyingDocId === doc.id ? 'text-green-400' : ''}`}
                          title="Copy link"
                        >
                          {copyingDocId === doc.id ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleView(doc)}
                          className="p-1.5 rounded text-text-muted/70 hover:text-blue-400 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 rounded text-text-muted/70 hover:text-green-400 transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-1.5 rounded text-text-muted/70 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUploadModal
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={() => {
            setShowUploadModal(false);
            fetchDocuments();
          }}
        />
      )}

      <DocumentPreviewModal
        doc={previewDoc}
        signedUrl={previewUrl}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
        onDownload={handleDownload}
      />
    </div>
  );
}

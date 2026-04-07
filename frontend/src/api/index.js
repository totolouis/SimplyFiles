const BASE = '/api';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `${method} ${path} → ${res.status}`;
    try {
      const err = await res.json();
      if (err.message) message = err.message;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  // Folders
  getFolders: () => req('GET', '/folders'),
  getRootContents: () => req('GET', '/folders/root'),
  getFolderContents: (id) => req('GET', `/folders/${id}`),
  createFolder: (name, parentId) => req('POST', '/folders', { name, parentId: parentId || null }),
  renameFolder: (id, name) => req('PATCH', `/folders/${id}`, { name }),
  deleteFolder: (id) => req('DELETE', `/folders/${id}`),
  moveFolder: (id, parentId) => req('PATCH', `/folders/${id}/move`, { parentId }),

  // Files
  uploadFile: (file, folderId) => {
    const fd = new FormData();
    const normalizedName = file.name.normalize('NFC');
    fd.append('file', file, normalizedName);
    if (folderId) fd.append('folderId', folderId);
    return req('POST', '/files/upload', fd);
  },
  getFile: (id) => req('GET', `/files/${id}`),
  deleteFile: (id) => req('DELETE', `/files/${id}`),
  moveFile: (id, folderId) => req('PATCH', `/files/${id}/move`, { folderId }),
  streamUrl: (id) => `${BASE}/files/${id}/stream`,
  downloadUrl: (id) => `${BASE}/files/${id}/download`,

  renameFile: (id, newName) => req('PATCH', `/files/${id}/rename`, { name: newName }),

  // Symlinks
  searchSymlinkTargets: (q) => req('GET', `/symlinks/search?q=${encodeURIComponent(q)}`),
  createSymlink: (body) => req('POST', '/symlinks', body),
  fixSymlinks: () => req('POST', '/symlinks/fix'),

  // Search
  search: (q) => req('GET', `/search?q=${encodeURIComponent(q)}`),
  searchGotoFolders: (query, page = 0, limit = 20) => req('POST', '/folders/search-goto', { query, page, limit }),
  getAllFiles: () => req('GET', '/files'),

  // Favorites
  getFavorites: () => req('GET', '/favorites'),
  addFavorite: (itemType, itemId) => req('POST', '/favorites', { itemType, itemId }),
  removeFavorite: (itemType, itemId) => req('DELETE', `/favorites/${itemType}/${itemId}`),
  checkFavorite: (itemType, itemId) => req('GET', `/favorites/check/${itemType}/${itemId}`),

  // Trash
  getTrash: () => req('GET', '/trash'),
  restoreFile: (id) => req('POST', `/trash/files/${id}/restore`),
  restoreFolder: (id) => req('POST', `/trash/folders/${id}/restore`),
  permanentDeleteFile: (id) => req('DELETE', `/trash/files/${id}`),
  permanentDeleteFolder: (id) => req('DELETE', `/trash/folders/${id}`),
  emptyTrash: () => req('DELETE', '/trash'),
};

// Index
export const indexApi = {
  getStats: () => req('GET', '/index/stats'),
  reindexMissing: () => req('POST', '/index/reindex-missing'),
  importFolder: (folderId) => req('POST', '/index/import-folder', { folderId }),
  sync: (folderId) => req('POST', '/index/sync', { folderId }),
  listSyncReports: () => req('GET', '/index/sync-reports'),
};

// Health
export const healthApi = {
  getVersion: () => req('GET', '/health/version'),
};

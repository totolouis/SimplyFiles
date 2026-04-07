import { useState, useCallback, useEffect } from 'react';
import { api } from '../api';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function useExplorer() {
  const [allFolders, setAllFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [contents, setContents] = useState({ folders: [], files: [] });
  const [selectedFile, _setSelectedFile] = useState(null);
  const [selectedFolder, _setSelectedFolder] = useState(null);

  const setSelectedFile = useCallback((file) => {
    _setSelectedFile(file);
    if (file) _setSelectedFolder(null);
  }, []);

  const setSelectedFolder = useCallback((folder) => {
    _setSelectedFolder(folder);
    if (folder) _setSelectedFile(null);
  }, []);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const loadFolders = useCallback(async () => {
    try {
      const folders = await api.getFolders();
      setAllFolders(folders);
    } catch (e) {
      console.error('Failed to load folders:', e);
    }
  }, []);

  const loadContents = useCallback(async (folderId) => {
    setLoading(true);
    setSelectedFile(null);
    setSelectedFolder(null);
    try {
      let data;
      if (folderId === null) {
        const rootData = await api.getRootContents();
        data = {
          folders: (rootData.folders || []).filter(f => f.parentId === null),
          files: (rootData.files || []).filter(f => f.folderId === null),
        };
        setBreadcrumbs([]);
      } else if (folderId === 'all_files') {
        const allFiles = await api.getAllFiles();
        data = { folders: [], files: allFiles || [] };
        setBreadcrumbs([{ id: 'all_files', name: 'All Files' }]);
      } else {
        data = await api.getFolderContents(folderId);
        const crumbs = [];
        let current = data.folder;
        const folderMap = {};
        allFolders.forEach(f => folderMap[f.id] = f);
        while (current) {
          crumbs.unshift({ id: current.id, name: current.name });
          current = current.parentId ? folderMap[current.parentId] : null;
        }
        setBreadcrumbs(crumbs);
      }
      setContents({ folders: data.folders || [], files: data.files || [] });
    } catch (e) {
      console.error('Failed to load contents:', e);
    } finally {
      setLoading(false);
    }
  }, [allFolders]);

  const expandFolder = useCallback((folderId) => {
    if (folderId === null) return;
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      newSet.add(folderId);
      return newSet;
    });
  }, []);

  const expandPathToFolder = useCallback((folderId) => {
    if (folderId === null) return;
    const folderMap = {};
    allFolders.forEach(f => folderMap[f.id] = f);
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      newSet.add(folderId);
      let current = folderMap[folderId];
      while (current?.parentId) {
        newSet.add(current.parentId);
        current = folderMap[current.parentId];
      }
      return newSet;
    });
  }, [allFolders]);

  const collapseAllFolders = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const toggleFolderExpansion = useCallback((folderId) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  const navigateTo = useCallback((folderId) => {
    setCurrentFolderId(folderId);
    setSelectedFile(null);
    setSelectedFolder(null);
    setSearchQuery('');
    setSearchResults(null);
    if (folderId !== null) {
      expandPathToFolder(folderId);
    }
  }, [expandPathToFolder]);

  const createFolder = useCallback(async (name) => {
    try {
      await api.createFolder(name, currentFolderId);
      await loadFolders();
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to create folder:', e);
    }
  }, [currentFolderId, loadFolders, loadContents]);

  const deleteFolder = useCallback(async (id) => {
    try {
      await api.deleteFolder(id);
      await loadFolders();

      const folderMap = {};
      allFolders.forEach(f => folderMap[f.id] = f);

      let checkId = currentFolderId;
      let isInsideDeleted = false;
      while (checkId !== null) {
        if (checkId === id) {
          isInsideDeleted = true;
          break;
        }
        checkId = folderMap[checkId]?.parentId || null;
      }

      if (isInsideDeleted) {
        const deletedFolder = folderMap[id];
        navigateTo(deletedFolder?.parentId || null);
      } else {
        await loadContents(currentFolderId);
      }
    } catch (e) {
      console.error('Failed to delete folder:', e);
    }
  }, [currentFolderId, allFolders, loadFolders, loadContents, navigateTo]);

  const renameFolder = useCallback(async (id, name) => {
    try {
      await api.renameFolder(id, name);
      await loadFolders();
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to rename folder:', e);
    }
  }, [currentFolderId, loadFolders, loadContents]);

  const moveFolder = useCallback(async (id, parentId) => {
    try {
      await api.moveFolder(id, parentId);
      await loadFolders();
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to move folder:', e);
    }
  }, [currentFolderId, loadFolders, loadContents]);

  const moveFile = useCallback(async (id, folderId) => {
    try {
      await api.moveFile(id, folderId);
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to move file:', e);
    }
  }, [currentFolderId, loadContents]);

  const uploadFiles = useCallback(async (files) => {
    const fileArray = Array.from(files);
    const oversized = fileArray.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      const names = oversized.map(f => f.name).join(', ');
      alert(`These files exceed the 100 MB limit: ${names}`);
      return;
    }

    setUploading(true);
    try {
      const results = await Promise.allSettled(
        fileArray.map(file => api.uploadFile(file, currentFolderId))
      );
      const duplicates = results
        .filter(r => r.status === 'rejected' && r.reason?.status === 409)
        .map(r => r.reason.message);
      const errors = results
        .filter(r => r.status === 'rejected' && r.reason?.status !== 409);
      if (duplicates.length > 0) {
        alert(duplicates.join('\n'));
      }
      if (errors.length > 0) {
        console.error('Failed to upload some files:', errors);
      }
      await loadFolders();
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to upload files:', e);
    } finally {
      setUploading(false);
    }
  }, [currentFolderId, loadFolders, loadContents]);

  const deleteFile = useCallback(async (id) => {
    try {
      await api.deleteFile(id);
      if (selectedFile?.id === id) setSelectedFile(null);
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to delete file:', e);
    }
  }, [currentFolderId, selectedFile, loadContents]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await api.search(q);
      setSearchResults(results);
    } catch (e) {
      console.error('Search failed:', e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const renameFile = useCallback(async (id, newName) => {
    try {
      const updated = await api.renameFile(id, newName);
      if (selectedFile?.id === id) setSelectedFile(updated);
      await loadContents(currentFolderId);
    } catch (e) {
      console.error('Failed to rename file:', e);
    }
  }, [currentFolderId, selectedFile, loadContents]);

  const refresh = useCallback(() => {
    loadFolders();
    loadContents(currentFolderId);
  }, [currentFolderId, loadFolders, loadContents]);

  useEffect(() => {
    loadContents(currentFolderId);
  }, [currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFolders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    allFolders,
    currentFolderId,
    contents,
    selectedFile,
    setSelectedFile,
    selectedFolder,
    setSelectedFolder,
    loading,
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    breadcrumbs,
    uploading,
    dragOver,
    setDragOver,
    expandedFolders,
    setExpandedFolders,
    expandFolder,
    expandPathToFolder,
    collapseAllFolders,
    toggleFolderExpansion,
    navigateTo,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    moveFile,
    uploadFiles,
    deleteFile,
    renameFile,
    doSearch,
    refresh,
  };
}

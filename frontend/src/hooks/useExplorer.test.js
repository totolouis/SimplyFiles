import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetFolders = vi.fn();
const mockGetRootContents = vi.fn();
const mockGetFolderContents = vi.fn();
const mockGetAllFiles = vi.fn();
const mockCreateFolder = vi.fn();
const mockDeleteFolder = vi.fn();
const mockRenameFolder = vi.fn();
const mockMoveFolder = vi.fn();
const mockMoveFile = vi.fn();
const mockUploadFile = vi.fn();
const mockDeleteFile = vi.fn();
const mockSearch = vi.fn();
const mockRenameFile = vi.fn();

vi.mock('../api', () => ({
  api: {
    getFolders: (...args) => mockGetFolders(...args),
    getRootContents: (...args) => mockGetRootContents(...args),
    getFolderContents: (...args) => mockGetFolderContents(...args),
    getAllFiles: (...args) => mockGetAllFiles(...args),
    createFolder: (...args) => mockCreateFolder(...args),
    deleteFolder: (...args) => mockDeleteFolder(...args),
    renameFolder: (...args) => mockRenameFolder(...args),
    moveFolder: (...args) => mockMoveFolder(...args),
    moveFile: (...args) => mockMoveFile(...args),
    uploadFile: (...args) => mockUploadFile(...args),
    deleteFile: (...args) => mockDeleteFile(...args),
    search: (...args) => mockSearch(...args),
    renameFile: (...args) => mockRenameFile(...args),
  },
}));

import { useExplorer } from './useExplorer';

describe('useExplorer', () => {
  const sampleFolders = [
    { id: 'f1', name: 'Documents', parentId: null },
    { id: 'f2', name: 'Photos', parentId: null },
    { id: 'f3', name: 'Work', parentId: 'f1' },
    { id: 'f4', name: 'Personal', parentId: 'f1' },
  ];

  const sampleContents = {
    folders: [{ id: 'f3', name: 'Work', parentId: 'f1' }],
    files: [{ id: 'file1', filename: 'doc.pdf', folderId: 'f1' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFolders.mockResolvedValue(sampleFolders);
    mockGetRootContents.mockResolvedValue({
      folders: sampleFolders.filter(f => f.parentId === null),
      files: [{ id: 'file1', filename: 'root.txt', folderId: null }],
    });
    mockGetFolderContents.mockResolvedValue({
      folder: { id: 'f1', name: 'Documents', parentId: null },
      ...sampleContents,
    });
    mockGetAllFiles.mockResolvedValue([
      { id: 'file1', filename: 'doc.pdf', folderId: 'f1' },
      { id: 'file2', filename: 'photo.jpg', folderId: 'f2' },
    ]);
  });

  describe('initial state', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useExplorer());

      expect(result.current.allFolders).toEqual([]);
      expect(result.current.currentFolderId).toBeNull();
      expect(result.current.contents).toEqual({ folders: [], files: [] });
      expect(result.current.selectedFile).toBeNull();
      expect(result.current.selectedFolder).toBeNull();
      // loading may be true initially because loadContents is called in useEffect on mount
      expect(typeof result.current.loading).toBe('boolean');
      expect(result.current.searchQuery).toBe('');
      expect(result.current.searchResults).toBeNull();
      expect(result.current.breadcrumbs).toEqual([]);
      expect(result.current.uploading).toBe(false);
    });

    it('should load folders on mount', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => {
        expect(result.current.allFolders).toEqual(sampleFolders);
      });
      expect(mockGetFolders).toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('should navigate to root (null)', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.navigateTo(null);
      });

      expect(result.current.currentFolderId).toBeNull();
      expect(result.current.breadcrumbs).toEqual([]);
    });

    it('should navigate to a specific folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.navigateTo('f1');
      });

      await waitFor(() => {
        expect(result.current.currentFolderId).toBe('f1');
      });
    });

    it('should clear search when navigating', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.setSearchQuery('test query');
      });

      act(() => {
        result.current.navigateTo('f1');
      });

      expect(result.current.searchQuery).toBe('');
      expect(result.current.searchResults).toBeNull();
    });
  });

  describe('content loading', () => {
    it('should load root contents', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => {
        expect(mockGetRootContents).toHaveBeenCalled();
      });
    });

    it('should load folder contents', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.navigateTo('f1');
      });

      await waitFor(() => {
        expect(mockGetFolderContents).toHaveBeenCalledWith('f1');
      });
    });

    it('should load all files view', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.navigateTo('all_files');
      });

      await waitFor(() => {
        expect(mockGetAllFiles).toHaveBeenCalled();
        expect(result.current.breadcrumbs).toEqual([{ id: 'all_files', name: 'All Files' }]);
      });
    });

    it('should build breadcrumbs for nested folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockGetFolderContents.mockResolvedValue({
        folder: { id: 'f3', name: 'Work', parentId: 'f1' },
        folders: [],
        files: [],
      });

      act(() => {
        result.current.navigateTo('f3');
      });

      await waitFor(() => {
        expect(result.current.breadcrumbs).toEqual([
          { id: 'f1', name: 'Documents' },
          { id: 'f3', name: 'Work' },
        ]);
      });
    });
  });

  describe('folder operations', () => {
    it('should create folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.navigateTo('f1');
      });

      mockCreateFolder.mockResolvedValue({ id: 'new-folder', name: 'New Folder' });

      await act(async () => {
        await result.current.createFolder('New Folder');
      });

      expect(mockCreateFolder).toHaveBeenCalledWith('New Folder', 'f1');
      expect(mockGetFolders).toHaveBeenCalledTimes(2);
    });

    it('should delete folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockDeleteFolder.mockResolvedValue({});

      await act(async () => {
        await result.current.deleteFolder('f2');
      });

      expect(mockDeleteFolder).toHaveBeenCalledWith('f2');
    });

    it('should navigate to parent when deleting current folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.navigateTo('f3');
      });

      mockDeleteFolder.mockResolvedValue({});

      await act(async () => {
        await result.current.deleteFolder('f3');
      });

      expect(result.current.currentFolderId).toBe('f1');
    });

    it('should rename folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockRenameFolder.mockResolvedValue({});

      await act(async () => {
        await result.current.renameFolder('f1', 'New Name');
      });

      expect(mockRenameFolder).toHaveBeenCalledWith('f1', 'New Name');
    });

    it('should move folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockMoveFolder.mockResolvedValue({});

      await act(async () => {
        await result.current.moveFolder('f2', 'f1');
      });

      expect(mockMoveFolder).toHaveBeenCalledWith('f2', 'f1');
    });
  });

  describe('file operations', () => {
    it('should move file', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockMoveFile.mockResolvedValue({});

      await act(async () => {
        await result.current.moveFile('file1', 'f2');
      });

      expect(mockMoveFile).toHaveBeenCalledWith('file1', 'f2');
    });

    it('should delete file', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockDeleteFile.mockResolvedValue({});

      await act(async () => {
        await result.current.deleteFile('file1');
      });

      expect(mockDeleteFile).toHaveBeenCalledWith('file1');
    });

    it('should clear selected file when deleting it', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      const file = { id: 'file1', filename: 'doc.pdf' };
      act(() => {
        result.current.setSelectedFile(file);
      });

      mockDeleteFile.mockResolvedValue({});

      await act(async () => {
        await result.current.deleteFile('file1');
      });

      expect(result.current.selectedFile).toBeNull();
    });

    it('should rename file', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockRenameFile.mockResolvedValue({ id: 'file1', filename: 'newname.pdf' });

      await act(async () => {
        await result.current.renameFile('file1', 'newname.pdf');
      });

      expect(mockRenameFile).toHaveBeenCalledWith('file1', 'newname.pdf');
    });
  });

  describe('file upload', () => {
    it('should upload files', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(mockFile, 'size', { value: 1024 });

      mockUploadFile.mockResolvedValue({});

      await act(async () => {
        await result.current.uploadFiles([mockFile]);
      });

      expect(mockUploadFile).toHaveBeenCalledWith(mockFile, null);
    });

    it('should reject files over 100MB', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      const mockFile = new File(['content'], 'large.bin', { type: 'application/octet-stream' });
      Object.defineProperty(mockFile, 'size', { value: 101 * 1024 * 1024 });

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      await act(async () => {
        await result.current.uploadFiles([mockFile]);
      });

      expect(mockUploadFile).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('should set uploading state during upload', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(mockFile, 'size', { value: 1024 });

      let resolveUpload;
      mockUploadFile.mockReturnValue(new Promise((resolve) => {
        resolveUpload = resolve;
      }));

      act(() => {
        result.current.uploadFiles([mockFile]);
      });

      expect(result.current.uploading).toBe(true);

      await act(async () => {
        resolveUpload({});
      });

      expect(result.current.uploading).toBe(false);
    });
  });

  describe('search', () => {
    it('should perform search', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockSearch.mockResolvedValue([{ id: 'file1', filename: 'result.pdf' }]);

      await act(async () => {
        await result.current.doSearch('test');
      });

      expect(mockSearch).toHaveBeenCalledWith('test');
      expect(result.current.searching).toBe(false);
    });

    it('should clear search results for empty query', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      // First, perform a search to populate searchResults
      mockSearch.mockResolvedValue([{ id: 'file1', filename: 'result.pdf' }]);
      await act(async () => {
        await result.current.doSearch('something');
      });

      expect(result.current.searchResults).not.toBeNull();

      // Now clear with empty query
      await act(async () => {
        await result.current.doSearch('');
      });

      expect(result.current.searchResults).toBeNull();
    });
  });

  describe('selection management', () => {
    it('should select file', () => {
      const { result } = renderHook(() => useExplorer());

      const file = { id: 'file1', filename: 'doc.pdf' };
      act(() => {
        result.current.setSelectedFile(file);
      });

      expect(result.current.selectedFile).toEqual(file);
      expect(result.current.selectedFolder).toBeNull();
    });

    it('should select folder', () => {
      const { result } = renderHook(() => useExplorer());

      const folder = { id: 'f1', name: 'Documents' };
      act(() => {
        result.current.setSelectedFolder(folder);
      });

      expect(result.current.selectedFolder).toEqual(folder);
      expect(result.current.selectedFile).toBeNull();
    });

    it('should clear selections on navigation', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.setSelectedFile({ id: 'file1', filename: 'doc.pdf' });
        result.current.setSelectedFolder({ id: 'f1', name: 'Docs' });
      });

      act(() => {
        result.current.navigateTo('f2');
      });

      expect(result.current.selectedFile).toBeNull();
      expect(result.current.selectedFolder).toBeNull();
    });
  });

  describe('folder expansion', () => {
    it('should expand folder', () => {
      const { result } = renderHook(() => useExplorer());

      act(() => {
        result.current.expandFolder('f1');
      });

      expect(result.current.expandedFolders.has('f1')).toBe(true);
    });

    it('should toggle folder expansion', () => {
      const { result } = renderHook(() => useExplorer());

      act(() => {
        result.current.toggleFolderExpansion('f1');
      });
      expect(result.current.expandedFolders.has('f1')).toBe(true);

      act(() => {
        result.current.toggleFolderExpansion('f1');
      });
      expect(result.current.expandedFolders.has('f1')).toBe(false);
    });

    it('should expand path to folder', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      act(() => {
        result.current.expandPathToFolder('f3');
      });

      expect(result.current.expandedFolders.has('f3')).toBe(true);
      expect(result.current.expandedFolders.has('f1')).toBe(true);
    });

    it('should collapse all folders', () => {
      const { result } = renderHook(() => useExplorer());

      act(() => {
        result.current.expandFolder('f1');
        result.current.expandFolder('f2');
      });

      act(() => {
        result.current.collapseAllFolders();
      });

      expect(result.current.expandedFolders.size).toBe(0);
    });
  });

  describe('refresh', () => {
    it('should refresh folders and contents', async () => {
      const { result } = renderHook(() => useExplorer());

      await waitFor(() => expect(result.current.allFolders).toEqual(sampleFolders));

      mockGetFolders.mockClear();
      mockGetRootContents.mockClear();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetFolders).toHaveBeenCalled();
      expect(mockGetRootContents).toHaveBeenCalled();
    });
  });
});

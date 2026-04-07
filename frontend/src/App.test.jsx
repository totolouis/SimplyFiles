import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Stub EventSource (used by useTasks hook, not available in jsdom)
class MockEventSource {
  constructor() {
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
    this.close = vi.fn();
  }
}
MockEventSource.CONNECTING = 0;
MockEventSource.OPEN = 1;
MockEventSource.CLOSED = 2;
globalThis.EventSource = MockEventSource;

// Mock the API calls so App doesn't hit a real backend
vi.mock('./api', () => ({
  api: {
    getFolders: vi.fn().mockResolvedValue([]),
    getRootContents: vi.fn().mockResolvedValue({ folder: null, children: [], files: [] }),
    getFolderContents: vi.fn().mockResolvedValue({ folder: null, children: [], files: [] }),
    createFolder: vi.fn().mockResolvedValue({}),
    renameFolder: vi.fn().mockResolvedValue({}),
    deleteFolder: vi.fn().mockResolvedValue({}),
    deleteFile: vi.fn().mockResolvedValue({}),
    moveFile: vi.fn().mockResolvedValue({}),
    renameFile: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([]),
    searchGotoFolders: vi.fn().mockResolvedValue({ results: [], total: 0 }),
    getAllFiles: vi.fn().mockResolvedValue([]),
    moveFolder: vi.fn().mockResolvedValue({}),
  },
  indexApi: {
    listSyncReports: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({}),
    sync: vi.fn().mockResolvedValue({}),
  },
  healthApi: {
    getVersion: vi.fn().mockResolvedValue({ version: '0.0.0-test' }),
  },
}));

describe('App', () => {
  beforeEach(() => {
    // Clear localStorage to avoid leaking state between tests
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(<App />);
    // The sidebar logo text should be visible
    expect(screen.getByText('DocVault')).toBeInTheDocument();
  });
});

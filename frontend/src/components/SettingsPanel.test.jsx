import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./SettingsPanel.css', () => ({}));
vi.mock('./SyncReportModal.css', () => ({}));

const mockGetStats = vi.fn();
const mockSync = vi.fn();

vi.mock('../api', () => ({
  indexApi: {
    getStats: (...args) => mockGetStats(...args),
    sync: (...args) => mockSync(...args),
  },
}));

import SettingsPanel from './SettingsPanel';

describe('SettingsPanel', () => {
  const baseProps = {
    onClose: vi.fn(),
    currentFolderId: null,
    displayMode: 'truncate',
    setDisplayMode: vi.fn(),
    onSyncComplete: vi.fn(),
  };

  const mockStats = {
    total: 100,
    indexed: 85,
    unindexed: 15,
    byType: {
      pdf: 5,
      text: 8,
      other: 2,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStats.mockResolvedValue(mockStats);
    mockSync.mockResolvedValue({
      operations: [
        { label: 'Files added', items: [] },
        { label: 'Files updated', items: ['file1.txt'] },
      ],
    });
  });

  describe('rendering', () => {
    it('should render settings panel', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should show close button', () => {
      render(<SettingsPanel {...baseProps} />);
      const closeBtn = document.querySelector('.settings-close');
      expect(closeBtn).toBeInTheDocument();
    });

    it('should render search index section', async () => {
      render(<SettingsPanel {...baseProps} />);
      await waitFor(() => {
        expect(screen.getByText('SEARCH INDEX')).toBeInTheDocument();
      });
    });

    it('should render sync section', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('SYNC')).toBeInTheDocument();
    });

    it('should render display settings section', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('DISPLAY')).toBeInTheDocument();
    });

    it('should render about section', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('ABOUT')).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<SettingsPanel {...baseProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.settings-close');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop clicked', () => {
      const onClose = vi.fn();
      render(<SettingsPanel {...baseProps} onClose={onClose} />);

      const backdrop = document.querySelector('.settings-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking panel content', () => {
      const onClose = vi.fn();
      render(<SettingsPanel {...baseProps} onClose={onClose} />);

      const panel = document.querySelector('.settings-panel');
      fireEvent.click(panel);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('stats loading', () => {
    it('should show loading state initially', () => {
      mockGetStats.mockReturnValue(new Promise(() => {}));
      render(<SettingsPanel {...baseProps} />);

      expect(document.querySelector('.stats-loading')).toBeInTheDocument();
    });

    it('should display stats after loading', async () => {
      render(<SettingsPanel {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('total files')).toBeInTheDocument();
        expect(screen.getByText('85')).toBeInTheDocument();
        expect(screen.getByText('indexed')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText('not indexed')).toBeInTheDocument();
      });
    });

    it('should show progress bar', async () => {
      render(<SettingsPanel {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByText('85% indexed')).toBeInTheDocument();
      });
    });

    it('should show error when stats load fails', async () => {
      mockGetStats.mockRejectedValue(new Error('Failed'));
      render(<SettingsPanel {...baseProps} />);

      await waitFor(() => {
        // The error text may appear in multiple places (stats section and sync error section)
        // since they share the same error state
        const errorElements = screen.getAllByText('Could not load index stats.');
        expect(errorElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should show type breakdown when there are unindexed files', async () => {
      render(<SettingsPanel {...baseProps} />);

      await waitFor(() => {
        expect(screen.getByText(/5 PDFs not indexed/)).toBeInTheDocument();
        expect(screen.getByText(/8 text files not indexed/)).toBeInTheDocument();
        expect(screen.getByText(/2 files not indexable/)).toBeInTheDocument();
      });
    });
  });

  describe('sync functionality', () => {
    it('should show sync button', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('Sync')).toBeInTheDocument();
    });

    it('should call sync API when sync button clicked', async () => {
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(mockSync).toHaveBeenCalledWith(null);
      });
    });

    it('should sync current folder when currentFolderId is set', async () => {
      render(<SettingsPanel {...baseProps} currentFolderId="f1" />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(mockSync).toHaveBeenCalledWith('f1');
      });
    });

    it('should show syncing state', async () => {
      mockSync.mockReturnValue(new Promise(() => {}));
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      expect(screen.getByText('Syncing...')).toBeInTheDocument();
      expect(syncBtn).toBeDisabled();
    });

    it('should show sync summary after completion', async () => {
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(screen.getByText(/1 files updated/)).toBeInTheDocument();
      });
    });

    it('should show "Everything is in sync" when no changes', async () => {
      mockSync.mockResolvedValue({
        operations: [{ label: 'Files added', items: [] }],
      });
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(screen.getByText('Everything is in sync')).toBeInTheDocument();
      });
    });

    it('should show view report button after sync', async () => {
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(screen.getByText('View sync report')).toBeInTheDocument();
      });
    });

    it('should open sync report modal when view report clicked', async () => {
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        const viewReportBtn = screen.getByText('View sync report');
        fireEvent.click(viewReportBtn);
      });

      expect(screen.getByText('Sync Report')).toBeInTheDocument();
    });

    it('should show sync error message', async () => {
      mockSync.mockRejectedValue(new Error('Sync failed'));
      render(<SettingsPanel {...baseProps} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(screen.getByText('Sync failed. Check API logs.')).toBeInTheDocument();
      });
    });

    it('should call onSyncComplete after successful sync', async () => {
      const onSyncComplete = vi.fn();
      render(<SettingsPanel {...baseProps} onSyncComplete={onSyncComplete} />);

      const syncBtn = screen.getByText('Sync').closest('button');
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(onSyncComplete).toHaveBeenCalled();
      });
    });
  });

  describe('display mode toggle', () => {
    it('should show truncate option', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('Truncate')).toBeInTheDocument();
    });

    it('should show wrap option', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('Wrap')).toBeInTheDocument();
    });

    it('should mark truncate as active when displayMode is truncate', () => {
      render(<SettingsPanel {...baseProps} displayMode="truncate" />);
      const truncateBtn = screen.getByText('Truncate').closest('button');
      expect(truncateBtn).toHaveClass('active');
    });

    it('should mark wrap as active when displayMode is wrap', () => {
      render(<SettingsPanel {...baseProps} displayMode="wrap" />);
      const wrapBtn = screen.getByText('Wrap').closest('button');
      expect(wrapBtn).toHaveClass('active');
    });

    it('should call setDisplayMode when truncate clicked', () => {
      const setDisplayMode = vi.fn();
      render(<SettingsPanel {...baseProps} setDisplayMode={setDisplayMode} />);

      const truncateBtn = screen.getByText('Truncate').closest('button');
      fireEvent.click(truncateBtn);

      expect(setDisplayMode).toHaveBeenCalledWith('truncate');
    });

    it('should call setDisplayMode when wrap clicked', () => {
      const setDisplayMode = vi.fn();
      render(<SettingsPanel {...baseProps} setDisplayMode={setDisplayMode} />);

      const wrapBtn = screen.getByText('Wrap').closest('button');
      fireEvent.click(wrapBtn);

      expect(setDisplayMode).toHaveBeenCalledWith('wrap');
    });
  });

  describe('about section', () => {
    it('should show version info', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('Version')).toBeInTheDocument();
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });

    it('should show search engine info', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('Search engine')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL FTS')).toBeInTheDocument();
    });

    it('should show PDF extraction info', () => {
      render(<SettingsPanel {...baseProps} />);
      expect(screen.getByText('PDF extraction')).toBeInTheDocument();
      expect(screen.getByText('pdf-parse')).toBeInTheDocument();
    });
  });
});

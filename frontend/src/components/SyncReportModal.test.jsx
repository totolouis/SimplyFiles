import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./SyncReportModal.css', () => ({}));

import SyncReportModal from './SyncReportModal';

describe('SyncReportModal', () => {
  const baseProps = {
    report: null,
    onClose: vi.fn(),
  };

  it('should render nothing when report is null', () => {
    const { container } = render(<SyncReportModal {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render modal when report is provided', () => {
    const report = {
      operations: [
        { label: 'Files added', items: ['file1.txt', 'file2.txt'] },
        { label: 'Files updated', items: ['file3.txt'] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    expect(screen.getByText('Sync Report')).toBeInTheDocument();
  });

  it('should show empty message when no operations', () => {
    const report = { operations: [] };
    render(<SyncReportModal {...baseProps} report={report} />);

    expect(screen.getByText('Nothing to report.')).toBeInTheDocument();
  });

  it('should display operation labels with counts', () => {
    const report = {
      operations: [
        { label: 'Files added', items: ['file1.txt', 'file2.txt'] },
        { label: 'Files removed', items: [] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    expect(screen.getByText('Files added')).toBeInTheDocument();
    expect(screen.getByText('Files removed')).toBeInTheDocument();
  });

  it('should show item count for each operation', () => {
    const report = {
      operations: [
        { label: 'Files added', items: ['file1.txt', 'file2.txt'] },
        { label: 'Files updated', items: ['file3.txt'] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const report = { operations: [] };
    render(<SyncReportModal report={report} onClose={onClose} />);

    const backdrop = document.querySelector('.sync-report-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const report = { operations: [] };
    render(<SyncReportModal report={report} onClose={onClose} />);

    const closeBtn = document.querySelector('.settings-close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('should not close when clicking panel content', () => {
    const onClose = vi.fn();
    const report = { operations: [] };
    render(<SyncReportModal report={report} onClose={onClose} />);

    const panel = document.querySelector('.sync-report-panel');
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should expand operation to show items when clicked', () => {
    const report = {
      operations: [
        { label: 'Files added', items: ['file1.txt', 'file2.txt'] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();

    const opHeader = document.querySelector('.sync-op-header');
    fireEvent.click(opHeader);

    expect(screen.getByText('file1.txt')).toBeInTheDocument();
    expect(screen.getByText('file2.txt')).toBeInTheDocument();
  });

  it('should collapse expanded operation when clicked again', () => {
    const report = {
      operations: [
        { label: 'Files added', items: ['file1.txt'] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    const opHeader = document.querySelector('.sync-op-header');
    fireEvent.click(opHeader);
    expect(screen.getByText('file1.txt')).toBeInTheDocument();

    fireEvent.click(opHeader);
    expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();
  });

  it('should show failure styling for failed operations', () => {
    const report = {
      operations: [
        { label: 'Failed to add', items: ['error.txt'] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    const opHeader = document.querySelector('.sync-op-header');
    expect(opHeader.classList.contains('failure')).toBe(true);
  });

  it('should disable click on empty operations', () => {
    const report = {
      operations: [
        { label: 'No changes', items: [] },
      ],
    };
    render(<SyncReportModal {...baseProps} report={report} />);

    // The sync-op-header button is disabled when count is 0
    const opHeader = document.querySelector('.sync-op-header');
    expect(opHeader).toBeDisabled();
    expect(opHeader.classList.contains('empty')).toBe(true);
  });
});

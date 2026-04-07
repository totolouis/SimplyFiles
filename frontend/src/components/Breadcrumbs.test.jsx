import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./Breadcrumbs.css', () => ({}));

import Breadcrumbs from './Breadcrumbs';

const defaultProps = {
  breadcrumbs: [],
  navigateTo: vi.fn(),
  dragOver: false,
  onItemDrop: vi.fn(),
};

describe('Breadcrumbs', () => {
  describe('home crumb', () => {
    it('should always render a Home breadcrumb', () => {
      render(<Breadcrumbs {...defaultProps} />);

      const homeCrumb = document.querySelector('.crumb-home');
      expect(homeCrumb).toBeInTheDocument();
    });

    it('should navigate to root when Home is clicked', () => {
      const navigateTo = vi.fn();
      render(<Breadcrumbs {...defaultProps} navigateTo={navigateTo} />);

      fireEvent.click(document.querySelector('.crumb-home'));
      expect(navigateTo).toHaveBeenCalledWith(null);
    });
  });

  describe('folder breadcrumbs', () => {
    it('should render breadcrumb trail for nested folders', () => {
      const breadcrumbs = [
        { id: 'f1', name: 'Documents' },
        { id: 'f2', name: 'Work' },
        { id: 'f3', name: 'Projects' },
      ];

      render(<Breadcrumbs {...defaultProps} breadcrumbs={breadcrumbs} />);

      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    it('should render chevron separators between crumbs', () => {
      const breadcrumbs = [
        { id: 'f1', name: 'Documents' },
        { id: 'f2', name: 'Work' },
      ];

      render(<Breadcrumbs {...defaultProps} breadcrumbs={breadcrumbs} />);

      const separators = document.querySelectorAll('.crumb-sep');
      expect(separators).toHaveLength(2);
    });

    it('should mark last crumb as active', () => {
      const breadcrumbs = [
        { id: 'f1', name: 'Documents' },
        { id: 'f2', name: 'Current' },
      ];

      render(<Breadcrumbs {...defaultProps} breadcrumbs={breadcrumbs} />);

      const crumbs = document.querySelectorAll('.crumb:not(.crumb-home)');
      expect(crumbs[0].classList.contains('crumb-active')).toBe(false);
      expect(crumbs[1].classList.contains('crumb-active')).toBe(true);
    });

    it('should navigate to folder when breadcrumb is clicked', () => {
      const navigateTo = vi.fn();
      const breadcrumbs = [
        { id: 'f1', name: 'Documents' },
        { id: 'f2', name: 'Work' },
      ];

      render(<Breadcrumbs {...defaultProps} navigateTo={navigateTo} breadcrumbs={breadcrumbs} />);

      fireEvent.click(screen.getByText('Documents'));
      expect(navigateTo).toHaveBeenCalledWith('f1');
    });

    it('should render empty trail when no breadcrumbs (root level)', () => {
      render(<Breadcrumbs {...defaultProps} breadcrumbs={[]} />);

      const crumbs = document.querySelectorAll('.crumb:not(.crumb-home)');
      expect(crumbs).toHaveLength(0);
    });
  });

  describe('drag and drop', () => {
    it('should show drop hint when dragOver is true', () => {
      render(<Breadcrumbs {...defaultProps} dragOver={true} />);

      expect(screen.getByText('Drop to upload')).toBeInTheDocument();
    });

    it('should not show drop hint when dragOver is false', () => {
      render(<Breadcrumbs {...defaultProps} dragOver={false} />);

      expect(screen.queryByText('Drop to upload')).not.toBeInTheDocument();
    });

    it('should call onItemDrop when item is dropped on Home crumb', () => {
      const onItemDrop = vi.fn();
      render(<Breadcrumbs {...defaultProps} onItemDrop={onItemDrop} />);

      const homeCrumb = document.querySelector('.crumb-home');

      fireEvent.dragOver(homeCrumb, {
        dataTransfer: {
          types: ['application/x-docvault-type'],
          dropEffect: '',
        },
      });

      fireEvent.drop(homeCrumb, {
        dataTransfer: {
          getData: (key) => {
            if (key === 'application/x-docvault-type') return 'file';
            if (key === 'application/x-docvault-id') return 'file-1';
            return '';
          },
        },
      });

      expect(onItemDrop).toHaveBeenCalledWith('file', 'file-1', null);
    });

    it('should call onItemDrop with folder id when dropped on folder crumb', () => {
      const onItemDrop = vi.fn();
      const breadcrumbs = [{ id: 'f1', name: 'Target' }];

      render(<Breadcrumbs {...defaultProps} onItemDrop={onItemDrop} breadcrumbs={breadcrumbs} />);

      const folderCrumb = screen.getByText('Target');

      fireEvent.drop(folderCrumb, {
        dataTransfer: {
          getData: (key) => {
            if (key === 'application/x-docvault-type') return 'folder';
            if (key === 'application/x-docvault-id') return 'folder-2';
            return '';
          },
        },
      });

      expect(onItemDrop).toHaveBeenCalledWith('folder', 'folder-2', 'f1');
    });
  });
});

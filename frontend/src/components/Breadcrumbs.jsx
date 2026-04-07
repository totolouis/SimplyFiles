import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronRight, Home } from 'lucide-react';
import './Breadcrumbs.css';

function BreadcrumbDropTarget({ children, folderId, navigateTo, onItemDrop, className = '' }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('application/x-docvault-type')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const type = e.dataTransfer.getData('application/x-docvault-type');
    const id = e.dataTransfer.getData('application/x-docvault-id');
    if (!type || !id) return;
    onItemDrop(type, id, folderId);
  };

  return (
    <button
      className={`${className} ${dragOver ? 'crumb-drop-target' : ''}`}
      onClick={() => navigateTo(folderId)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
    </button>
  );
}

BreadcrumbDropTarget.propTypes = {
  children: PropTypes.node.isRequired,
  folderId: PropTypes.string,
  navigateTo: PropTypes.func.isRequired,
  onItemDrop: PropTypes.func.isRequired,
  className: PropTypes.string,
};

function Breadcrumbs({ breadcrumbs, navigateTo, dragOver, onItemDrop }) {
  return (
    <div className="breadcrumbs-container">
      <div className="breadcrumbs">
        <BreadcrumbDropTarget
          className="crumb crumb-home"
          folderId={null}
          navigateTo={navigateTo}
          onItemDrop={onItemDrop}
        >
          <Home size={13} />
        </BreadcrumbDropTarget>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight size={12} className="crumb-sep" />
            <BreadcrumbDropTarget
              className={`crumb ${i === breadcrumbs.length - 1 ? 'crumb-active' : ''}`}
              folderId={crumb.id}
              navigateTo={navigateTo}
              onItemDrop={onItemDrop}
            >
              {crumb.name}
            </BreadcrumbDropTarget>
          </React.Fragment>
        ))}
        {dragOver && <span className="drop-hint">Drop to upload</span>}
      </div>
    </div>
  );
}

Breadcrumbs.propTypes = {
  breadcrumbs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  navigateTo: PropTypes.func.isRequired,
  dragOver: PropTypes.bool.isRequired,
  onItemDrop: PropTypes.func.isRequired,
};

export default Breadcrumbs;

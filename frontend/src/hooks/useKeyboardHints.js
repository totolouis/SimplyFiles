import { useState, useCallback, useEffect } from 'react';

export function useKeyboardHints() {
  const [hintsVisible, setHintsVisible] = useState(false);
  const [hintKey, setHintKey] = useState('');

  const showHints = useCallback(() => {
    setHintsVisible(true);
  }, []);

  const hideHints = useCallback(() => {
    setHintsVisible(false);
  }, []);

// Listen for hint key (hold '\' to show hints)
useEffect(() => {
const handleKeyDown = (e) => {
if (e.key === '\\' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
// Check if not typing in an input
const target = e.target;
if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
return;
}
setHintKey('\\');
showHints();
}
};

const handleKeyUp = (e) => {
if (e.key === '\\') {
hideHints();
setHintKey('');
}
};

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [showHints, hideHints]);

  return { hintsVisible, hintKey, showHints, hideHints };
}

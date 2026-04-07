import { useState, useCallback, useEffect } from 'react';
import { api } from '../api';

export function useFavorites() {
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());

  const loadFavorites = useCallback(async () => {
    try {
      const data = await api.getFavorites();
      setFavorites(data);
      setFavoriteIds(new Set(data.map(f => `${f.itemType}:${f.itemId}`)));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const isFavorite = useCallback((itemType, itemId) => {
    return favoriteIds.has(`${itemType}:${itemId}`);
  }, [favoriteIds]);

  const toggleFavorite = useCallback(async (itemType, itemId) => {
    const key = `${itemType}:${itemId}`;
    if (favoriteIds.has(key)) {
      await api.removeFavorite(itemType, itemId);
    } else {
      await api.addFavorite(itemType, itemId);
    }
    await loadFavorites();
  }, [favoriteIds, loadFavorites]);

  return { favorites, favoriteIds, loadFavorites, isFavorite, toggleFavorite };
}

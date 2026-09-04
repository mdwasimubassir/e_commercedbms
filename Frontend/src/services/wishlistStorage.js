// The database schema has no wishlist table, so this is a small bonus
// feature implemented entirely on the client with localStorage. It is
// scoped per signed-in user so accounts on the same browser don't mix.
function storageKey(userId) {
  return `ecommerce_wishlist_${userId}`;
}

export function getWishlist(userId) {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId))) || [];
  } catch {
    return [];
  }
}

export function isWishlisted(userId, productId) {
  return getWishlist(userId).some((id) => String(id) === String(productId));
}

export function toggleWishlist(userId, productId) {
  const current = getWishlist(userId);
  const exists = current.some((id) => String(id) === String(productId));
  const next = exists ? current.filter((id) => String(id) !== String(productId)) : [...current, productId];
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return !exists;
}

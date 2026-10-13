import { useWishlist } from '../context/wishlist-context';

// Тонкая обёртка над общим WishlistContext, чтобы счётчик в аккаунте
// всегда совпадал с состоянием сердечек на всём сайте.
export const useWishlistSummary = () => {
    const { count, isLoading, error, reload } = useWishlist();
    return { count, isLoading, error, reload };
};

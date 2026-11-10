import { useEffect } from 'react';
import { brand } from '../config/brand';

export function usePageTitle(page: string) {
  useEffect(() => {
    document.title = page ? `${page}${brand.titleSeparator}${brand.name}` : brand.name;
  }, [page]);
}

import { lazy, useState, type ComponentType } from 'react';

// A page whose code loads when it is first opened, or a little earlier when a link to it is pointed at.
// Once loaded it renders at once, without the short delay React adds before revealing suspended content.
function lazyPage(load: () => Promise<ComponentType>) {
  let Loaded: ComponentType | undefined;
  const preload = () => load().then((page) => (Loaded = page));
  // After a new release the old code files are gone; reloading fetches the new ones.
  const Lazy = lazy(() => preload().then((page) => ({ default: page }), () => {
    location.reload();
    return new Promise<never>(() => {});
  }));
  // Chosen once per visit of the page, so it is not remounted when its code arrives.
  const Page = () => {
    const [Component] = useState(() => Loaded ?? Lazy);
    return <Component />;
  };
  return { Page, preload };
}

const stock = lazyPage(() => import('./Stock').then((m) => m.Stock));
const portfolio = lazyPage(() => import('./Portfolio').then((m) => m.Portfolio));
const screener = lazyPage(() => import('./Screener').then((m) => m.Screener));
const about = lazyPage(() => import('./About').then((m) => m.About));

export const { Page: Stock, preload: loadStock } = stock;
export const { Page: Portfolio, preload: loadPortfolio } = portfolio;
export const { Page: Screener, preload: loadScreener } = screener;
export const { Page: About } = about;

// The code of the page at `pathname`, so the first screen shows without a loading flash.
export function loadPage(pathname: string): Promise<unknown> {
  if (pathname.startsWith('/stock/')) return loadStock();
  const page = { '/portfolio': portfolio, '/screener': screener, '/about': about }[pathname];
  return page ? page.preload() : Promise.resolve();
}

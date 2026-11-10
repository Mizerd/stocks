import type { NewsItem } from '../../shared/types';
import { cachedText } from '../http';

const text = (xml: string, tag: string) =>
  xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))?.[1].trim() ?? '';

// Nasdaq Baltic's public RSS feed of issuer announcements.
export function parseNewsFeed(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const link = text(item, 'link').replaceAll('&amp;', '&');
    const time = new Date(text(item, 'pubDate'));
    if (!link.startsWith('https://') || Number.isNaN(time.getTime())) continue;
    items.push({ title: text(item, 'title'), link, time: time.toISOString(), issuer: text(item, 'issuer') });
  }
  return items;
}

export async function balticNews(lang: 'lt' | 'en'): Promise<NewsItem[]> {
  const xml = await cachedText(`https://nasdaqbaltic.com/statistics/${lang}/news?rss=1`, 300, 'application/rss+xml');
  return parseNewsFeed(xml).slice(0, 8);
}

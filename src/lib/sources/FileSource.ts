// Tier-1 ContentSource implementation, backed by astro:content collections.
// This is the seam: pages + jsonld.ts only ever talk to the ContentSource
// interface, never to astro:content directly, so Tier 2 (D1Source) can
// swap in later without touching a single template or JSON-LD builder.
import { getCollection } from 'astro:content';
import type {
  ContentSource, Author, Book, Series, Hub, EventItem,
} from '../ContentSource';

function mapAuthor(entry: Awaited<ReturnType<typeof getCollection<'author'>>>[number]): Author {
  const d = entry.data;
  return {
    slug: d.slug,
    name: d.name,
    alternateName: d.alternateName,
    bio: d.bio,
    photo: d.photo ? (typeof d.photo === 'string' ? d.photo : d.photo.src) : undefined,
    url: d.url,
    sameAs: d.sameAs,
    email: d.email,
  };
}

async function mapBook(entry: Awaited<ReturnType<typeof getCollection<'books'>>>[number]): Promise<Book> {
  const d = entry.data;
  return {
    title: d.title,
    subtitle: d.subtitle,
    slug: d.slug,
    description: d.description,
    cover: typeof d.cover === 'string' ? d.cover : d.cover.src,
    datePublished: d.datePublished,
    language: d.language,
    genres: d.genres,
    editions: d.editions,
    comps: d.comps,
    authorSlugs: d.authors.map((a) => a.id),
    seriesSlug: d.series?.id,
    seriesPosition: d.seriesPosition,
  };
}

export class FileSource implements ContentSource {
  async getAuthors(): Promise<Author[]> {
    const entries = await getCollection('author');
    return entries.map(mapAuthor);
  }

  async getAuthorBySlug(slug: string): Promise<Author | undefined> {
    const all = await this.getAuthors();
    return all.find((a) => a.slug === slug);
  }

  async getBooks(): Promise<Book[]> {
    const entries = await getCollection('books');
    return Promise.all(entries.map(mapBook));
  }

  async getBook(slug: string): Promise<Book | undefined> {
    const entries = await getCollection('books');
    const entry = entries.find((e) => e.data.slug === slug);
    return entry ? mapBook(entry) : undefined;
  }

  async getSeries(): Promise<Series[]> {
    const entries = await getCollection('series');
    return entries.map((e) => ({
      name: e.data.name,
      slug: e.data.slug,
      description: e.data.description,
      cover: e.data.cover ? (typeof e.data.cover === 'string' ? e.data.cover : e.data.cover.src) : undefined,
      comps: e.data.comps,
      authorSlugs: e.data.authors.map((a) => a.id),
    }));
  }

  async getSeriesBySlug(slug: string): Promise<Series | undefined> {
    const all = await this.getSeries();
    return all.find((s) => s.slug === slug);
  }

  async getHubs(): Promise<Hub[]> {
    const entries = await getCollection('hubs');
    return entries.map((e) => ({
      name: e.data.name,
      slug: e.data.slug,
      description: e.data.description,
      about: e.data.about,
      bookSlugs: e.data.books.map((b) => b.id),
      comps: e.data.comps,
    }));
  }

  async getHub(slug: string): Promise<Hub | undefined> {
    const all = await this.getHubs();
    return all.find((h) => h.slug === slug);
  }

  async getEvents(): Promise<EventItem[]> {
    const entries = await getCollection('events');
    return entries.map((e) => ({
      name: e.data.name,
      slug: e.data.slug,
      description: e.data.description,
      startDate: e.data.startDate,
      endDate: e.data.endDate,
      location: e.data.location,
      url: e.data.url,
      eventAttendanceMode: e.data.eventAttendanceMode,
    }));
  }
}

import localforage from 'localforage';
import type { Repository, SingletonRepository } from '@/data/repositories';

/**
 * localForage-backed implementations of the repository interfaces.
 * Each collection gets its own IndexedDB store for clean separation and
 * fast `getAll` via iteration.
 */

export class LocalRepository<T extends { id: string }> implements Repository<T> {
  private store: LocalForage;

  constructor(storeName: string) {
    this.store = localforage.createInstance({
      name: 'gym-tracker',
      storeName,
    });
  }

  async get(id: string): Promise<T | null> {
    return (await this.store.getItem<T>(id)) ?? null;
  }

  async getAll(): Promise<T[]> {
    const items: T[] = [];
    await this.store.iterate<T, void>((value) => {
      items.push(value);
    });
    return items;
  }

  async put(item: T): Promise<T> {
    await this.store.setItem(item.id, item);
    return item;
  }

  async putMany(items: T[]): Promise<void> {
    await Promise.all(items.map((i) => this.store.setItem(i.id, i)));
  }

  async remove(id: string): Promise<void> {
    await this.store.removeItem(id);
  }
}

export class LocalSingleton<T> implements SingletonRepository<T> {
  private store: LocalForage;
  private key = 'value';

  constructor(storeName: string) {
    this.store = localforage.createInstance({
      name: 'gym-tracker',
      storeName,
    });
  }

  async get(): Promise<T | null> {
    return (await this.store.getItem<T>(this.key)) ?? null;
  }

  async set(value: T): Promise<T> {
    await this.store.setItem(this.key, value);
    return value;
  }
}

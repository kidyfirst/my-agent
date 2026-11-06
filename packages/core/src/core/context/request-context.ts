export class RequestContext<
	TValues extends Record<string, unknown> = Record<string, unknown>,
> {
	private _map: Map<string, unknown>

	constructor(
		iterable?: Iterable<[string, unknown]> | Record<string, unknown>,
	) {
		this._map = new Map()
		if (iterable) {
			if (
				Symbol.iterator in (iterable as object) &&
				typeof (iterable as Iterable<[string, unknown]>)[Symbol.iterator] ===
					"function"
			) {
				for (const [k, v] of iterable as Iterable<[string, unknown]>) {
					this._map.set(k, v)
				}
			} else if (typeof iterable === "object") {
				for (const [k, v] of Object.entries(iterable)) {
					this._map.set(k, v)
				}
			}
		}
	}

	get<K extends keyof TValues>(key: K): TValues[K]
	get<T = unknown>(key: string): T | undefined
	get(key: string): unknown {
		return this._map.get(key)
	}

	set<K extends keyof TValues>(key: K, value: TValues[K]): this
	set(key: string, value: unknown): this {
		this._map.set(key, value)
		return this
	}

	has(key: string): boolean {
		return this._map.has(key)
	}

	delete(key: string): boolean {
		return this._map.delete(key)
	}

	getRaw<T = unknown>(key: string): T | undefined {
		return this._map.get(key) as T | undefined
	}

	setRaw(key: string, value: unknown): this {
		this._map.set(key, value)
		return this
	}

	hasRaw(key: string): boolean {
		return this._map.has(key)
	}

	deleteRaw(key: string): boolean {
		return this._map.delete(key)
	}

	clear(): void {
		this._map.clear()
	}

	size(): number {
		return this._map.size
	}

	keys(): IterableIterator<string> {
		return this._map.keys()
	}

	values(): IterableIterator<unknown> {
		return this._map.values()
	}

	entries(): IterableIterator<[string, unknown]> {
		return this._map.entries()
	}

	forEach(
		callback: (value: unknown, key: string, map: Map<string, unknown>) => void,
	): void {
		this._map.forEach(callback)
	}

	[Symbol.iterator](): IterableIterator<[string, unknown]> {
		return this._map.entries()
	}

	get all(): Record<string, unknown> {
		return Object.fromEntries(this._map.entries())
	}

	isSerializable(value: unknown): boolean {
		if (value === null || value === undefined) return true
		const type = typeof value
		if (type === "function" || type === "symbol") return false
		if (type === "number" || type === "string" || type === "boolean")
			return true
		if (type === "object") {
			try {
				JSON.stringify(value)
				return true
			} catch {
				return false
			}
		}
		return false
	}

	toJSON(): Record<string, unknown> {
		const result: Record<string, unknown> = {}
		for (const [k, v] of this._map.entries()) {
			if (typeof v === "function" || typeof v === "symbol") continue
			try {
				JSON.stringify(v)
				result[k] = v
			} catch {}
		}
		return result
	}

	serializeForSpan(): Record<string, unknown> {
		return this.toJSON()
	}
}

export class RequestContext<
	TValues extends Record<string, any> = Record<string, any>,
> {
	private _map: Map<string, any>

	constructor(iterable?: Iterable<[string, any]> | Record<string, any>) {
		this._map = new Map()
		if (iterable) {
			if (typeof (iterable as any)[Symbol.iterator] === "function") {
				for (const [k, v] of iterable as Iterable<[string, any]>) {
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
	get(key: string): any {
		return this._map.get(key)
	}

	set<K extends keyof TValues>(key: K, value: TValues[K]): this
	set(key: string, value: any): this {
		this._map.set(key, value)
		return this
	}

	has(key: string): boolean {
		return this._map.has(key)
	}

	delete(key: string): boolean {
		return this._map.delete(key)
	}

	getRaw(key: string): any {
		return this._map.get(key)
	}

	setRaw(key: string, value: any): this {
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

	values(): IterableIterator<any> {
		return this._map.values()
	}

	entries(): IterableIterator<[string, any]> {
		return this._map.entries()
	}

	forEach(
		callback: (value: any, key: string, map: Map<string, any>) => void,
	): void {
		this._map.forEach(callback)
	}

	[Symbol.iterator](): IterableIterator<[string, any]> {
		return this._map.entries()
	}

	get all(): Record<string, any> {
		return Object.fromEntries(this._map.entries())
	}

	isSerializable(value: any): boolean {
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

	toJSON(): Record<string, any> {
		const result: Record<string, any> = {}
		for (const [k, v] of this._map.entries()) {
			if (typeof v === "function" || typeof v === "symbol") continue
			try {
				JSON.stringify(v)
				result[k] = v
			} catch {}
		}
		return result
	}

	serializeForSpan(): Record<string, any> {
		return this.toJSON()
	}
}

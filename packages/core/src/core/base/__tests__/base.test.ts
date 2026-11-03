import { describe, it, expect } from "vitest"
import { CoreBase } from "../index.js"

describe("src/core/base - CoreBase", () => {
	it("initializes with component and name", () => {
		class CustomService extends CoreBase {
			constructor() {
				super({ component: "STORAGE", name: "CustomService" })
			}
		}

		const s = new CustomService()
		expect(s.component).toBe("STORAGE")
		expect(s.name).toBe("CustomService")
	})

	it("supports logger and config setting", () => {
		const base = new CoreBase({ component: "TEST", name: "TestBase" })
		const dummyLogger = { info: () => {}, error: () => {} }
		base.__setLogger(dummyLogger)
		expect(base.logger).toBe(dummyLogger)

		base.__setRawConfig({ foo: "bar" })
		expect(base.toRawConfig()).toEqual({ foo: "bar" })
	})
})

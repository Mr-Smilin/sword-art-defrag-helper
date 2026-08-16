// 測試環境前置設定。
//
// Node 25 自己內建了一個實驗性的 localStorage 全域，會蓋掉 jsdom 提供的那一份；
// 而且在沒有給 --localstorage-file 的情況下它是個不能用的空物件（連 clear() 都沒有）。
// 這裡直接換成一份乾淨的記憶體實作，測試才不會被 Node / jsdom 的版本差異影響。

class MemoryStorage {
	#map = new Map();

	get length() {
		return this.#map.size;
	}

	key(index) {
		return Array.from(this.#map.keys())[index] ?? null;
	}

	getItem(key) {
		return this.#map.has(String(key)) ? this.#map.get(String(key)) : null;
	}

	setItem(key, value) {
		this.#map.set(String(key), String(value));
	}

	removeItem(key) {
		this.#map.delete(String(key));
	}

	clear() {
		this.#map.clear();
	}
}

const storage = new MemoryStorage();

for (const target of [globalThis, globalThis.window].filter(Boolean)) {
	Object.defineProperty(target, "localStorage", {
		value: storage,
		writable: true,
		configurable: true,
	});
}

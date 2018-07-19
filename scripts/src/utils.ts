export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => T, predicate: (o: any) => boolean, errorMessage?: string): Promise<T> {
	for (let i = 0; i < 30; i++) {
		const obj = await fn();
		if (predicate(obj)) {
			return obj;
		}
		await delay(1000);
	}
	throw new Error(errorMessage || "failed");
}

export function pick<T, K extends keyof T>(obj: T, ...props: K[]): Pick<T, K> {
	const newObj = {} as Pick<T, K>;
	props.forEach(name => newObj[name] = obj[name]);
	return newObj;
}

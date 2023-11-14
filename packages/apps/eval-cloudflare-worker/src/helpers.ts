import type { LocalStorageCompat } from '@growthbook/growthbook/dist/types/growthbook';

export const localStoragePolyfill = (env: any): LocalStorageCompat => ({
	getItem: (key: string) => env[env.KV_STORE].get(key),
	setItem: (key: string, value: any) => env[env.KV_STORE].set(key, value),
});

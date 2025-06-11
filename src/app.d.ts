// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User, Session } from 'lucia';
import type { ClientUser } from '$lib/types.js';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: User | null;
			session: Session | null;
		}
		interface PageData {
			user: ClientUser | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

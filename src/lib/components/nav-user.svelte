<script lang="ts">
	import * as Avatar from "$lib/components/ui/avatar/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import { goto } from '$app/navigation';
	import { toggleMode } from 'mode-watcher';
	import { authStore } from '$lib/stores/auth.svelte.js';
	import BadgeCheckIcon from "@lucide/svelte/icons/badge-check";
	import BellIcon from "@lucide/svelte/icons/bell";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import CreditCardIcon from "@lucide/svelte/icons/credit-card";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import SunIcon from "@lucide/svelte/icons/sun";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	let { user }: { user: { name?: string; username: string; email?: string; avatar?: string } } = $props();
	const sidebar = useSidebar();
	
	async function logout() {
		try {
			await authStore.logout();
			goto('/login');
		} catch (err) {
			console.error('Logout error:', err);
		}
	}

	// Compute display values
	const displayName = $derived(user.name || user.username);
	const displayEmail = $derived(user.email || '');
	const avatarUrl = $derived(user.avatar || '');
</script>

<!-- User info section -->
<div class="group/user-section">
	{#if !sidebar.isMobile && sidebar.state === "collapsed"}
		<!-- Collapsed state: compact layout with dropdown -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex h-10 w-10 items-center justify-center rounded-lg border-t p-0 hover:bg-accent transition-colors"
				aria-label="User menu"
			>
				<Avatar.Root class="h-8 w-8 rounded-lg">
					<Avatar.Image src={avatarUrl} alt={displayName} />
					<Avatar.Fallback class="rounded-lg text-xs">{displayName.split(' ').map(n => n[0]).join('').toUpperCase()}</Avatar.Fallback>
				</Avatar.Root>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-56" align="end" side="right">
				<DropdownMenu.Label class="font-normal">
					<div class="flex flex-col space-y-1">
						<p class="text-sm font-medium leading-none">{displayName}</p>
						<p class="text-xs leading-none text-muted-foreground">{displayEmail}</p>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={toggleMode}>
					<div class="relative mr-2 h-4 w-4">
						<SunIcon class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
						<MoonIcon class="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
					</div>
					<span>Toggle Theme</span>
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={logout} class="text-red-600 focus:text-red-600">
					<LogOutIcon class="mr-2 h-4 w-4" />
					<span>Logout</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		<!-- Expanded state: full layout -->
		<div class="flex items-center gap-2 p-3 border-t">
			<Avatar.Root class="h-8 w-8 rounded-lg shrink-0">
				<Avatar.Image src={avatarUrl} alt={displayName} />
				<Avatar.Fallback class="rounded-lg text-xs">{displayName.split(' ').map(n => n[0]).join('').toUpperCase()}</Avatar.Fallback>
			</Avatar.Root>
			<div class="flex flex-col text-left text-sm leading-tight flex-1 min-w-0">
				<span class="truncate font-medium">{displayName}</span>
				<span class="truncate text-xs text-muted-foreground">{displayEmail}</span>
			</div>
			<div class="flex items-center gap-1 shrink-0">
				<!-- Theme toggle button -->
				<button 
					onclick={toggleMode}
					class="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
					aria-label="Toggle theme"
					title="Toggle theme"
				>
					<div class="relative h-4 w-4">
						<SunIcon class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
						<MoonIcon class="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
					</div>
				</button>
				
				<!-- Logout button -->
				<button 
					onclick={logout}
					class="flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"
					aria-label="Logout"
					title="Logout"
					disabled={authStore.loading}
				>
					<LogOutIcon class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}
</div>

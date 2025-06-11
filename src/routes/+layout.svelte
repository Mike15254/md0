<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { ModeWatcher } from "mode-watcher";
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import { authStore } from '$lib/stores/auth.svelte.js';
	
	let { children, data } = $props();
	
	// Initialize auth store with server data
	onMount(() => {
		authStore.init(data.user);
	});
	
	// Redirect to login if not authenticated and not on login page
	$effect(() => {
		if (typeof window !== 'undefined' && authStore.initialized && !authStore.isAuthenticated && !$page.url.pathname.startsWith('/login')) {
			goto('/login');
		}
	});
	
	// Don't show sidebar on login page
	const showSidebar = $derived(!$page.url.pathname.startsWith('/login') && authStore.isAuthenticated);
</script>

<ModeWatcher/>

{#if showSidebar}
	<Sidebar.Provider open={false}>
		<AppSidebar user={authStore.user} />
		<Sidebar.Inset>
			<PageHeader />
			<main class="flex-1 overflow-auto">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
{:else}
	{@render children()}
{/if}
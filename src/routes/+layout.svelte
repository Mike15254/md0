<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { ModeWatcher } from "mode-watcher";
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	
	let { children, data } = $props();
	
	// Redirect to login if not authenticated and not on login page
	$effect(() => {
		if (typeof window !== 'undefined' && !data.user && !$page.url.pathname.startsWith('/login')) {
			goto('/login');
		}
	});
	
	// Don't show sidebar on login page
	const showSidebar = $derived(!$page.url.pathname.startsWith('/login'));
</script>

<ModeWatcher/>

{#if showSidebar}
	<Sidebar.Provider open={false}>
		<AppSidebar user={data.user} />
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
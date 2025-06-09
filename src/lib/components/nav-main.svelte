<script lang="ts">
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { page } from '$app/stores';

	let {
		items,
	}: {
		items: {
			title: string;
			url: string;
			// this should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon?: any;
			isActive?: boolean;
			items?: {
				title: string;
				url: string;
			}[];
		}[];
	} = $props();

	// Function to check if a route is active
	function isRouteActive(itemUrl: string, currentPath: string): boolean {
		if (itemUrl === '/' && currentPath === '/') return true;
		if (itemUrl !== '/' && currentPath.startsWith(itemUrl)) return true;
		return false;
	}

	// Function to check if any subroute is active
	function hasActiveSubroute(item: any, currentPath: string): boolean {
		if (!item.items) return false;
		return item.items.some((subItem: any) => isRouteActive(subItem.url, currentPath));
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as item (item.title)}
			{@const currentPath = $page.url.pathname}
			{@const itemActive = isRouteActive(item.url, currentPath)}
			{@const hasSubrouteActive = hasActiveSubroute(item, currentPath)}
			{@const isOpen = itemActive || hasSubrouteActive}
			{@const hasSubroutes = item.items && item.items.length > 0}
			
			{#if hasSubroutes}
				<Collapsible.Root open={isOpen} class="group/collapsible">
					{#snippet child({ props }: { props: Record<string, any> })}
						<Sidebar.MenuItem {...props}>
							<Collapsible.Trigger>
								{#snippet child({ props }: { props: Record<string, any> })}
									<Sidebar.MenuButton {...props} tooltipContent={item.title} data-active={itemActive}>
										{#if item.icon}
											<item.icon />
										{/if}
										<span>{item.title}</span>
										<ChevronRightIcon
											class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
										/>
									</Sidebar.MenuButton>
								{/snippet}
							</Collapsible.Trigger>
							<Collapsible.Content>
								<Sidebar.MenuSub>
									{#each item.items ?? [] as subItem (subItem.title)}
										{@const subItemActive = isRouteActive(subItem.url, currentPath)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton>
												{#snippet child({ props }: { props: Record<string, any> })}
													<a href={subItem.url} {...props} data-active={subItemActive}>
														<span>{subItem.title}</span>
													</a>
												{/snippet}
											</Sidebar.MenuSubButton>
										</Sidebar.MenuSubItem>
									{/each}
								</Sidebar.MenuSub>
							</Collapsible.Content>
						</Sidebar.MenuItem>
					{/snippet}
				</Collapsible.Root>
			{:else}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton asChild>
						{#snippet child({ props }: { props: Record<string, any> })}
							<a href={item.url} {...props} data-active={itemActive}>
								{#if item.icon}
									<item.icon />
								{/if}
								<span>{item.title}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>

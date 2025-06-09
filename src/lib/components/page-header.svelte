<script lang="ts">
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { page, navigating } from '$app/stores';
	
	let {
		breadcrumbs = [],
		children
	}: {
		breadcrumbs?: Array<{ label: string; href?: string }>;
		children?: any;
	} = $props();

	// Generate breadcrumbs from route if not provided
	const defaultBreadcrumbs = $derived(() => {
		if (breadcrumbs.length > 0) return breadcrumbs;
		
		const pathSegments = $page.url.pathname.split('/').filter(Boolean);
		const generated = [];
		
		if (pathSegments.length === 0) {
			generated.push({ label: 'Home' });
		} else {
			generated.push({ label: 'Home', href: '/' });
			
			let currentPath = '';
			pathSegments.forEach((segment, index) => {
				currentPath += `/${segment}`;
				const isLast = index === pathSegments.length - 1;
				const label = segment.charAt(0).toUpperCase() + segment.slice(1);
				
				if (isLast) {
					generated.push({ label });
				} else {
					generated.push({ label, href: currentPath });
				}
			});
		}
		
		return generated;
	});
</script>

<header class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1 sidebar-trigger-enhanced rounded-md p-2" />
		<Separator orientation="vertical" class="mr-2 h-4" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each defaultBreadcrumbs() as breadcrumb, index (breadcrumb.label)}
					{#if index > 0}
						<Breadcrumb.Separator />
					{/if}
					<Breadcrumb.Item class={index === 0 ? "hidden md:block" : ""}>
						{#if breadcrumb.href}
							<Breadcrumb.Link 
								href={breadcrumb.href}
								class="nav-loading {$navigating ? 'is-navigating' : ''}"
							>
								{breadcrumb.label}
							</Breadcrumb.Link>
						{:else}
							<Breadcrumb.Page>{breadcrumb.label}</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
	
	{#if children}
		<div class="ml-auto px-4">
			{@render children()}
		</div>
	{/if}
</header>

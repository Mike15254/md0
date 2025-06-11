<script lang="ts" module>
	import HomeIcon from "@lucide/svelte/icons/home";
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import DatabaseIcon from "@lucide/svelte/icons/database";
	import ServerIcon from "@lucide/svelte/icons/server";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import BarChart3Icon from "@lucide/svelte/icons/bar-chart-3";
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import CommandIcon from "@lucide/svelte/icons/command";

	// Application data for MD0 project
	const data = {
		user: {
			name: "Developer",
			username: "Developer",
			email: "dev@md0.com",
			avatar: "/logo.png",
		},
		teams: [
			{
				name: "MD0",
				logo: CommandIcon,
				plan: "Working as usual",
			},
		],
		navMain: [
			{
				title: "Dashboard",
				url: "/",
				icon: HomeIcon,
			},
			{
				title: "Projects",
				url: "/projects",
				icon: GitBranchIcon,
			},
			{
				title: "Databases",
				url: "/databases",
				icon: DatabaseIcon,
			},
			{
				title: "System",
				url: "/system",
				icon: ServerIcon,
			},
			{
				title: "Settings",
				url: "/settings",
				icon: SettingsIcon,
			},
		],
		projects: [],
	};
</script>

<script lang="ts">
	import NavMain from "./nav-main.svelte";
	import NavProjects from "./nav-projects.svelte";
	import NavUser from "./nav-user.svelte";
	import TeamSwitcher from "./team-switcher.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import type { ComponentProps } from "svelte";
	import { SettingsIcon } from "lucide-svelte";
	import type { ClientUser } from '$lib/types.js';

	let {
		user = null,
		ref = $bindable(null),
		collapsible = "icon",
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & { 
		user?: ClientUser | null 
	} = $props();
	
	// Use real user data if available, otherwise fallback to default
	const userData = $derived(user ? {
		name: user.username,
		username: user.username,
		email: user.email || "user@md0.com",
		avatar: "/avatar.png"
	} : data.user);
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Header>
		<TeamSwitcher teams={data.teams} />
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={data.navMain} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser user={userData} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>

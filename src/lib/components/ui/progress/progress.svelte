<script lang="ts">
	import { cn } from "$lib/utils.js";
	
	type $$Props = {
		value?: number;
		max?: number;
		class?: string;
		indicatorClass?: string;
	};

	let {
		value = 0,
		max = 100,
		class: className,
		indicatorClass,
		...restProps
	}: $$Props = $props();

	const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
</script>

<div
	class={cn(
		"relative h-4 w-full overflow-hidden rounded-full bg-secondary",
		className
	)}
	{...restProps}
>
	<div
		class={cn(
			"h-full w-full flex-1 bg-primary transition-all",
			indicatorClass
		)}
		style="transform: translateX(-{100 - percentage}%)"
	></div>
</div>

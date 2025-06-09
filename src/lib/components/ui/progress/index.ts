import { cn } from "$lib/utils.js";
import Progress from "./progress.svelte";

type ProgressProps = {
	value?: number;
	max?: number;
	class?: string;
	indicatorClass?: string;
	[key: string]: any;
};

export { Progress, type ProgressProps };

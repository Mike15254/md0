<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { authStore } from '$lib/stores/auth.svelte.js';
	import { Loader2, Eye, EyeOff } from 'lucide-svelte';
	
	let { data } = $props();
	
	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let error = $state('');
	let isSubmitting = $state(false);
	
	// Initialize auth store with server data
	onMount(() => {
		authStore.init(data.user);
		
		// Redirect if already authenticated
		if (data.user) {
			goto('/', { replaceState: true });
		}
	});
	
	// Handle form validation
	const isFormValid = $derived(username.trim() && password.trim());
	const isLoading = $derived(authStore.loading || isSubmitting);
	
	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		
		if (!isFormValid) {
			error = 'Please fill in all fields';
			return;
		}
		
		isSubmitting = true;
		error = '';
		
		try {
			const result = await authStore.login(username.trim(), password);
			
			if (result.success) {
				// Small delay for better UX
				await new Promise(resolve => setTimeout(resolve, 500));
				goto('/', { replaceState: true });
			} else {
				error = result.error || 'Invalid credentials';
				// Focus back to username field for retry
				document.getElementById('username')?.focus();
			}
		} catch (err) {
			error = 'Something went wrong. Please try again.';
			console.error('Login error:', err);
		} finally {
			isSubmitting = false;
		}
	}
	
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && isFormValid && !isLoading) {
			// Create a synthetic form submit event
			const target = event.target as HTMLElement;
			const form = target?.closest('form');
			if (form) {
				form.requestSubmit();
			}
		}
	}

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}
</script>

<svelte:head>
	<title>MD0 - Login</title>
	<meta name="description" content="Sign in to your MD0 deployment platform" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<!-- Logo and title -->
		<div class="text-center">
			<div class="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
				<span class="text-2xl font-bold text-primary">M</span>
			</div>
			<h1 class="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Sign in to your MD0 deployment platform
			</p>
		</div>
		
		<Card class="border-0 shadow-xl">
			<CardHeader class="space-y-1">
				<CardTitle class="text-2xl font-semibold tracking-tight">Sign in</CardTitle>
				<CardDescription>
					Enter your credentials to access your dashboard
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<form onsubmit={handleLogin} class="space-y-4">
					<div class="space-y-2">
						<Label for="username">Username</Label>
						<Input
							id="username"
							type="text"
							bind:value={username}
							placeholder="Enter your username"
							disabled={isLoading}
							onkeydown={handleKeyPress}
							class="h-11"
							autocomplete="username"
							required
						/>
					</div>
					
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<div class="relative">
							<Input
								id="password"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								placeholder="Enter your password"
								disabled={isLoading}
								onkeydown={handleKeyPress}
								class="h-11 pr-10"
								autocomplete="current-password"
								required
							/>
							<button
								type="button"
								onclick={togglePasswordVisibility}
								class="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
								tabindex="-1"
							>
								{#if showPassword}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>
					
					{#if error}
						<div class="p-3 rounded-md bg-destructive/10 border border-destructive/20">
							<p class="text-sm text-destructive font-medium">{error}</p>
						</div>
					{/if}
					
					<Button 
						type="submit"
						disabled={!isFormValid || isLoading}
						class="w-full h-11 font-medium"
						variant="default"
					>
						{#if isLoading}
							<Loader2 class="h-4 w-4 mr-2 animate-spin" />
							Signing in...
						{:else}
							Sign in
						{/if}
					</Button>
				</form>
				
				<!-- Demo credentials hint -->
				<div class="mt-6 p-3 rounded-md bg-muted/50 border border-muted">
					<p class="text-xs text-muted-foreground text-center">
						Demo credentials: <strong>mike</strong> / <strong>Mikedev998</strong>
					</p>
				</div>
			</CardContent>
		</Card>
	</div>
</div>

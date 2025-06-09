<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	
	let { data } = $props();
	
	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');
	
	// Redirect if already authenticated
	onMount(() => {
		if (data.user) {
			goto('/');
		}
	});
	
	async function handleLogin() {
		if (!username || !password) {
			error = 'Please fill in all fields';
			return;
		}
		
		loading = true;
		error = '';
		
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ username, password })
			});
			
			const result = await response.json();
			
			if (result.success) {
				goto('/');
			} else {
				error = result.error || 'Login failed';
			}
		} catch (err) {
			error = 'Network error. Please try again.';
			console.error('Login error:', err);
		} finally {
			loading = false;
		}
	}
	
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleLogin();
		}
	}
</script>

<svelte:head>
	<title>MD0 - Login</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<!-- <img src="/logo.png" alt="MD0 Logo" class="mx-auto h-12 w-auto mt-4" /> -->
			<h1 class="text-2xl">Md0</h1>
		</div>
		
		<Card>
			<CardHeader>
				<CardTitle>Login</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="username">Username</Label>
					<Input
						id="username"
						type="text"
						bind:value={username}
						placeholder="Enter your username"
						disabled={loading}
						onkeydown={handleKeyPress}
					/>
				</div>
				
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						placeholder="Enter your password"
						disabled={loading}
						onkeydown={handleKeyPress}
					/>
				</div>
				
				{#if error}
					<div class="text-red-600 text-sm">{error}</div>
				{/if}
				
				<Button 
					onclick={handleLogin} 
					disabled={loading || !username || !password}
					class="w-full"
				>
					{loading ? 'Signing in...' : 'Sign in'}
				</Button>
			</CardContent>
		</Card>
	</div>
</div>

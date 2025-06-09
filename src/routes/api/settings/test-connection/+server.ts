import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth.js';
import { query } from '$lib/server/database.js';
import { spawn } from 'child_process';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const user = requireAuth(locals);

		// Get VPS settings from database
		const settingsResult = await query(
			`SELECT key, value FROM settings WHERE category = 'system' AND key IN ('vps_hostname', 'vps_ip', 'ssh_port', 'ssh_key_path')`
		);

		const settings: Record<string, string> = {};
		for (const row of settingsResult) {
			settings[row.key] = row.value;
		}

		const { vps_hostname, vps_ip, ssh_port = '22', ssh_key_path } = settings;

		if (!vps_hostname && !vps_ip) {
			return json({
				success: false,
				error: 'VPS hostname or IP address not configured'
			}, { status: 400 });
		}

		// Test SSH connection
		const target = vps_hostname || vps_ip;
		const port = ssh_port || '22';

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve(json({
					success: false,
					error: 'Connection timeout (10 seconds)'
				}));
			}, 10000);

			// Use ssh command to test connection
			const sshArgs = [
				'-o', 'ConnectTimeout=5',
				'-o', 'BatchMode=yes',
				'-o', 'StrictHostKeyChecking=no',
				'-p', port
			];

			if (ssh_key_path) {
				sshArgs.push('-i', ssh_key_path);
			}

			sshArgs.push(`root@${target}`, 'echo "Connection successful"');

			const ssh = spawn('ssh', sshArgs);
			let output = '';
			let error = '';

			ssh.stdout.on('data', (data) => {
				output += data.toString();
			});

			ssh.stderr.on('data', (data) => {
				error += data.toString();
			});

			ssh.on('close', (code) => {
				clearTimeout(timeout);
				
				if (code === 0 && output.includes('Connection successful')) {
					resolve(json({
						success: true,
						message: 'SSH connection successful',
						details: {
							target,
							port,
							output: output.trim()
						}
					}));
				} else {
					resolve(json({
						success: false,
						error: `SSH connection failed (exit code: ${code})`,
						details: {
							target,
							port,
							stderr: error.trim(),
							stdout: output.trim()
						}
					}));
				}
			});

			ssh.on('error', (err) => {
				clearTimeout(timeout);
				resolve(json({
					success: false,
					error: `SSH command failed: ${err.message}`
				}));
			});
		});
	} catch (error) {
		console.error('Test connection error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to test connection'
		}, { status: 500 });
	}
};

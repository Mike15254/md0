#!/usr/bin/env node
// Script to create new users for MD0 dashboard
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

if (process.argv.length < 4) {
    console.log('Usage: node create-user.js <username> <password> [email] [is_admin]');
    console.log('Example: node create-user.js john password123 john@example.com false');
    process.exit(1);
}

const username = process.argv[2];
const password = process.argv[3];
const email = process.argv[4] || null;
const isAdmin = process.argv[5] === 'true' || false;

const passwordHash = bcrypt.hashSync(password, 10);

console.log(`
-- SQL to create user: ${username}
INSERT INTO users (username, password_hash, email, is_admin) VALUES 
('${username}', '${passwordHash}', ${email ? `'${email}'` : 'NULL'}, ${isAdmin})
ON CONFLICT (username) DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    email = EXCLUDED.email,
    is_admin = EXCLUDED.is_admin;
`);

console.log(`\nLogin credentials:`);
console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
console.log(`Email: ${email || 'Not set'}`);
console.log(`Admin: ${isAdmin ? 'Yes' : 'No'}`);

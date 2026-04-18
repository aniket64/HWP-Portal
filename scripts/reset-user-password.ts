#!/usr/bin/env tsx
import 'dotenv/config';
import { hashPassword } from '../server/auth';
import { getUserByEmail, updateUser, createUser } from '../server/db';

async function main() {
  const [,, email, newPassword, name, role] = process.argv;
  if (!email || !newPassword) {
    console.error('Usage: pnpm tsx scripts/reset-user-password.ts <email> <newPassword> [name] [role]');
    process.exit(2);
  }

  try {
    const user = await getUserByEmail(email.toLowerCase());
    const passwordHash = await hashPassword(newPassword);
    if (user) {
      await updateUser(user.id, { passwordHash });
      console.log(`Password updated for ${email}`);
      process.exit(0);
    }

    if (!name) {
      console.error('User not found. To create a new user provide a name and optionally a role.');
      process.exit(3);
    }

    const newUser = await createUser({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: (role as any) ?? 'admin',
      isActive: true,
    } as any);
    console.log(`Created user ${email} with role ${(role as any) ?? 'admin'}`);
    process.exit(0);
  } catch (err: any) {
    console.error('Error resetting/creating user:', err?.message ?? err);
    process.exit(4);
  }
}

main();

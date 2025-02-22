const { PrismaClient } = require('@prisma/client');
const { users } = require('../config/config');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting to seed users...');

  for (const user of users) {
    // Skip users without a role (like the last user 'shivam')
    if (!user.role) continue;

    try {
      await prisma.user.upsert({
        where: { username: user.username },
        update: {
          password: user.password,
          role: user.role
        },
        create: {
          id: user.id,
          username: user.username,
          password: user.password,
          role: user.role
        }
      });
      console.log(`User ${user.username} created/updated successfully`);
    } catch (error) {
      console.error(`Error creating/updating user ${user.username}:`, error);
    }
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
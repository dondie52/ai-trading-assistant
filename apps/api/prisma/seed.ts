import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed an admin user.");
  }

  const passwordHash = await hash(adminPassword, 10);
  const user = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      status: "ACTIVE"
    },
    create: {
      email: adminEmail.toLowerCase(),
      passwordHash,
      firstName: "Platform",
      lastName: "Admin",
      role: UserRole.ADMIN
    }
  });

  // Ops bootstrap only: empty portfolio/risk/watchlist. Never seed a PAPER broker —
  // production operators connect Alpaca (or another broker) explicitly.
  const [portfolio, riskRules, watchlist] = await Promise.all([
    prisma.portfolio.findFirst({ where: { userId: user.id } }),
    prisma.riskRule.findUnique({ where: { userId: user.id } }),
    prisma.watchlist.findFirst({ where: { userId: user.id } })
  ]);

  if (!portfolio) {
    await prisma.portfolio.create({
      data: {
        userId: user.id,
        portfolioName: "Broker Account",
        portfolioValue: 0,
        cashBalance: 0
      }
    });
  }

  if (!riskRules) {
    await prisma.riskRule.create({
      data: {
        userId: user.id,
        maxRiskPerTradePercent: 1,
        maxDailyLossPercent: 3,
        maxDrawdownPercent: 12,
        maxPositionSizePercent: 25
      }
    });
  }

  if (!watchlist) {
    await prisma.watchlist.create({
      data: {
        userId: user.id,
        name: "Watchlist",
        symbols: []
      }
    });
  }
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });

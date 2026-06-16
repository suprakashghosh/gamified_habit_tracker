/**
 * Validation seed: creates a hierarchical task tree, queries nested relations,
 * and verifies hierarchy integrity.
 *
 * Usage: npx tsx prisma/seed.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log("Cleaning existing test data...");
  await prisma.xPTransaction.deleteMany();
  await prisma.task.deleteMany();

  // Create AppState singleton
  await prisma.appState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", total_xp: 0, current_level: 1 },
    update: {},
  });
  console.log("✓ AppState singleton created");

  // ── Longterm root: "Read The Pragmatic Programmer — 24 chapters" ──
  const longtermTask = await prisma.task.create({
    data: {
      title: "Read The Pragmatic Programmer",
      description: "Complete all 24 chapters of the book",
      unit: "chapters",
      tier: "longterm",
      max_count: 24,
      current_count: 0,
      xp_per_unit: 300,
      is_published: true,
      status: "active",
      sort_order: 0,
    },
  });
  console.log(`✓ Longterm root: ${longtermTask.id} — ${longtermTask.title}`);

  // ── Monthly child: "Read 12 chapters" ──
  const monthlyTask = await prisma.task.create({
    data: {
      title: "Read 12 chapters (first half)",
      unit: "chapters",
      tier: "monthly",
      parent_id: longtermTask.id,
      max_count: 12,
      current_count: 0,
      xp_per_unit: 100,
      is_published: true,
      status: "active",
      sort_order: 0,
    },
  });
  console.log(`✓ Monthly child: ${monthlyTask.id} — parent: ${monthlyTask.parent_id}`);

  // ── Weekly child: "Read 3 chapters per week" ──
  const weeklyTask = await prisma.task.create({
    data: {
      title: "Read ~3 chapters",
      unit: "chapters",
      tier: "weekly",
      parent_id: monthlyTask.id,
      max_count: 3,
      current_count: 0,
      xp_per_unit: 30,
      is_published: true,
      status: "active",
      sort_order: 0,
    },
  });
  console.log(`✓ Weekly child: ${weeklyTask.id} — parent: ${weeklyTask.parent_id}`);

  // ── Daily leaf: "Read 1 chapter" ──
  const dailyTask = await prisma.task.create({
    data: {
      title: "Read 1 chapter",
      unit: "chapters",
      tier: "daily",
      parent_id: weeklyTask.id,
      max_count: 1,
      current_count: 0,
      xp_per_unit: 5,
      is_published: true,
      status: "active",
      sort_order: 0,
    },
  });
  console.log(`✓ Daily leaf: ${dailyTask.id} — parent: ${dailyTask.parent_id}`);

  // ── Standalone recurring task ──
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const standaloneTask = await prisma.task.create({
    data: {
      title: "Drink 8 glasses of water",
      unit: "glasses",
      tier: "daily",
      max_count: 8,
      current_count: 0,
      xp_per_unit: 5,
      is_recurring: true,
      is_published: true,
      status: "active",
      sort_order: 1,
      period_start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      period_end: endOfDay,
      expires_at: endOfDay,
      recurrence_group_id: "water-daily",
    },
  });
  console.log(`✓ Standalone recurring: ${standaloneTask.id} — ${standaloneTask.title}`);

  // ── Query verification ──
  console.log("\n─── Hierarchy verification ───");

  // Fetch full hierarchy from root
  const fullTree = await prisma.task.findUnique({
    where: { id: longtermTask.id },
    include: { children: { include: { children: { include: { children: true } } } } },
  });

  if (!fullTree) throw new Error("Root task not found");

  // Verify depth
  const depth1 = fullTree.children;
  console.log(`Depth 1 (monthly): ${depth1.length} child(ren)`);
  if (depth1.length !== 1) throw new Error(`Expected 1 monthly child, got ${depth1.length}`);

  const depth2 = depth1[0].children;
  console.log(`Depth 2 (weekly): ${depth2.length} child(ren)`);
  if (depth2.length !== 1) throw new Error(`Expected 1 weekly child, got ${depth2.length}`);

  const depth3 = depth2[0].children;
  console.log(`Depth 3 (daily): ${depth3.length} child(ren)`);
  if (depth3.length !== 1) throw new Error(`Expected 1 daily child, got ${depth3.length}`);

  // Verify unit consistency
  const allTasks = [fullTree, depth1[0], depth2[0], depth3[0]];
  const units = allTasks.map((t) => t.unit);
  const allSameUnit = units.every((u) => u === "chapters");
  console.log(`Unit consistency: ${allSameUnit ? "✓" : "✗"} ${units.join(", ")}`);
  if (!allSameUnit) throw new Error("Unit consistency broken");

  // Verify parent-child linking
  for (const child of depth1) {
    if (child.parent_id !== longtermTask.id) throw new Error("Parent link broken at monthly");
  }
  for (const child of depth2) {
    if (child.parent_id !== depth1[0].id) throw new Error("Parent link broken at weekly");
  }
  for (const child of depth3) {
    if (child.parent_id !== depth2[0].id) throw new Error("Parent link broken at daily");
  }
  console.log("✓ Parent-child links correct");

  // Verify sum of children max_counts relative to parent
  const monthlySum = depth1.reduce((sum, c) => sum + c.max_count, 0);
  console.log(`Monthly sum: ${monthlySum} / parent max: ${fullTree.max_count} ${monthlySum === fullTree.max_count ? "✓" : "(unequal — intentional, user allocates)"}`);

  // Verify XPTransaction creation works
  const xpTxn = await prisma.xPTransaction.create({
    data: {
      amount: 5,
      source_task_id: dailyTask.id,
      reason: "leaf_increment",
    },
  });
  console.log(`✓ XPTransaction created: ${xpTxn.id} — amount: ${xpTxn.amount}, reason: ${xpTxn.reason}`);

  // Verify XPTransaction links to task
  const txnWithTask = await prisma.xPTransaction.findUnique({
    where: { id: xpTxn.id },
    include: { source_task: true },
  });
  if (!txnWithTask || txnWithTask.source_task.id !== dailyTask.id) {
    throw new Error("XPTransaction task link broken");
  }
  console.log(`✓ XPTransaction links to task: ${txnWithTask.source_task.title}`);

  // Verify AppState
  const appState = await prisma.appState.findUnique({ where: { id: "singleton" } });
  if (!appState) throw new Error("AppState not found");
  console.log(`✓ AppState: level=${appState.current_level}, xp=${appState.total_xp}`);

  // Verify unique constraint on recurrence_group_id + period_start
  try {
    await prisma.task.create({
      data: {
        title: "Duplicate water task",
        unit: "glasses",
        tier: "daily",
        max_count: 8,
        current_count: 0,
        xp_per_unit: 5,
        is_recurring: true,
        is_published: true,
        status: "active",
        sort_order: 1,
        period_start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        period_end: endOfDay,
        expires_at: endOfDay,
        recurrence_group_id: "water-daily", // same as existing
      },
    });
    throw new Error("UNIQUE constraint not enforced on (recurrence_group_id, period_start)");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("duplicate key")) {
      console.log("✓ Unique constraint enforces recurrence idempotency");
    } else {
      throw err;
    }
  }

  // Verify self-relation cascade: deleting root cascades children
  const cascadeRoot = await prisma.task.create({
    data: {
      title: "Cascade test root",
      unit: "test",
      tier: "daily",
      max_count: 1,
      current_count: 0,
      xp_per_unit: 5,
      is_published: true,
      status: "active",
      sort_order: 99,
      children: {
        create: {
          title: "Cascade test child",
          unit: "test",
          tier: "daily",
          max_count: 1,
          current_count: 0,
          xp_per_unit: 5,
          is_published: true,
          status: "active",
          sort_order: 99,
        },
      },
    },
    include: { children: true },
  });
  console.log(`✓ Cascade test: created parent + ${cascadeRoot.children.length} child`);
  await prisma.task.delete({ where: { id: cascadeRoot.id } });
  const deletedChild = await prisma.task.findUnique({ where: { id: cascadeRoot.children[0].id } });
  if (deletedChild) throw new Error("Cascade delete failed — child still exists");
  console.log("✓ Cascade delete: child removed with parent");

  console.log("\n─── All validations passed ───");
}

main()
  .catch((e) => {
    console.error("Seed validation failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

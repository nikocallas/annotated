import "dotenv/config";
import { seedDemoData } from "../server/seed";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_DEMO_SEED !== "true") {
  throw new Error(
    "Refusing to seed production. Set ALLOW_PRODUCTION_DEMO_SEED=true only after confirming the target project.",
  );
}

await seedDemoData();
console.log("Demo seed completed.");

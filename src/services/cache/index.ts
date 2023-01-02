import dotenv from "dotenv";
import { MemoryCache } from "./MemoryCache";
dotenv.config({ path: "./.env.local" });

export const featuresCache = new MemoryCache();
Object.freeze(featuresCache);

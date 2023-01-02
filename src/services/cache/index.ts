import {MemoryCache} from "./MemoryCache";
import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

export const featuresCache = new MemoryCache();
Object.freeze(featuresCache);

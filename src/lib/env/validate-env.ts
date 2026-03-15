import { config } from "dotenv";
import { getServerEnv } from "./server-env";

config();

getServerEnv();

console.log("Environment validation passed.");

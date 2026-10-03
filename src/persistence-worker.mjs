import { MeteoraDbcLab } from "./environments/meteora-dbc-sim.mjs";
import { SolwealthBabyAI } from "./brain.mjs";
import { PersistentMemoryLedger } from "./persistence/file-memory.mjs";

const [mode, path] = process.argv.slice(2);
if (!mode || !path) throw new Error("usage: persistence-worker <seed|resume> <memory-path>");

const memory = PersistentMemoryLedger.open({ path });
const baby = new SolwealthBabyAI({ environment: new MeteoraDbcLab(), memory });

if (mode === "seed") {
  baby.birth();
  const observation = baby.observe({
    configExists: true,
    poolExists: false,
    migrationQuoteThreshold: 10,
    quoteReserve: 0,
  });
  const thought = baby.think(observation.id);
  const experience = baby.experience(thought.proposal.id, {
    approved: true,
    id: "persistence-demo-human-approval",
  });
  baby.reflect(experience);
  baby.learn();
  console.log(JSON.stringify({
    mode,
    headHash: memory.head().hash,
    entryCount: memory.size(),
    development: baby.development(),
    memoryVerified: baby.verifyMemory(),
    realMoney: false,
    transactionSigned: false,
    transactionSubmitted: false,
  }));
} else if (mode === "resume") {
  const resume = baby.resume();
  const learning = baby.learn();
  console.log(JSON.stringify({
    mode,
    resume,
    learning,
    headHash: memory.head().hash,
    entryCount: memory.size(),
    development: baby.development(),
    memoryVerified: baby.verifyMemory(),
    realMoney: false,
    transactionSigned: false,
    transactionSubmitted: false,
  }));
} else {
  throw new Error(`unknown persistence mode: ${mode}`);
}

import { SolwealthBabyAI } from "./brain.mjs";
import { MeteoraDbcLab } from "./environments/meteora-dbc-sim.mjs";

const solwealth = new SolwealthBabyAI({ environment: new MeteoraDbcLab() });

const birth = solwealth.birth();
const observation = solwealth.observe({ migrationQuoteThreshold: 10, quoteReserve: 0 });
const orientation = solwealth.orient(observation.id);
const proposal = solwealth.propose({
  observationId: observation.id,
  orientationId: orientation.id,
  action: "create_pool_plan",
  params: {
    tokenSymbol: "BABY",
    quoteMint: "SOL",
    migrationTarget: "DAMM_V2",
  },
});
const experience = solwealth.experience(proposal.id, {
  approved: true,
  id: "demo-human-approval",
});
const reflection = solwealth.reflect(experience);

console.log(
  JSON.stringify(
    {
      baby: "solwealth",
      birthHash: birth.hash,
      observationId: observation.id,
      orientation: orientation.disposition,
      proposalId: proposal.id,
      experience: experience.status,
      witness: experience.witness?.status,
      reflection: reflection.lesson,
      development: solwealth.development(),
      memoryVerified: solwealth.verifyMemory(),
      realMoney: false,
      transactionSigned: false,
      transactionSubmitted: false,
    },
    null,
    2,
  ),
);

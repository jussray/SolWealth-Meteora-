import { SolwealthBabyAI } from "./brain.mjs";
import { MeteoraDbcLab } from "./environments/meteora-dbc-sim.mjs";

const solwealth = new SolwealthBabyAI({ environment: new MeteoraDbcLab() });

const birth = solwealth.birth();
const observation = solwealth.observe({
  configExists: true,
  poolExists: false,
  migrationQuoteThreshold: 10,
  quoteReserve: 0,
});
const thought = solwealth.think(observation.id);
const proposal = thought.proposal;
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
      orientation: thought.orientation.disposition,
      mindDecision: thought.decision.action,
      mindCanSelfAuthorize: thought.decision.canSelfAuthorize,
      proposalId: proposal.id,
      proposalOrigin: proposal.origin,
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

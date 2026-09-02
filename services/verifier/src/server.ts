import { InMemoryEventBus, InMemoryStorage, RandomIdGen, SystemClock } from "@scenelock/ports";
import { Certifier } from "@scenelock/certifier";
import { buildVerifier } from "./app.js";

const PORT = Number(process.env.VERIFIER_PORT ?? 4200);

const clock = new SystemClock();
const storage = new InMemoryStorage();
const certifier = new Certifier({ storage, clock, ids: new RandomIdGen(), events: new InMemoryEventBus() });

buildVerifier(certifier)
  .listen({ port: PORT, host: process.env.HOST ?? "0.0.0.0" })
  .then(() => console.log(`[@scenelock/verifier] GET http://localhost:${PORT}/verify/:slug`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

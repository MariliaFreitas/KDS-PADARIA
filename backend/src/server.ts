import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp(env.CORS_ORIGIN);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[kds-padaria-backend] rodando em http://localhost:${env.PORT}`);
});

import { createApp } from './app';
import { config } from './config';
import { migrate } from './migrate';
import { seed } from './seed';

await migrate();
await seed();

createApp().listen(config.port, () => {
  console.log(`SpacePlan API listening on http://localhost:${config.port}`);
});

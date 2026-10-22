import path from 'path';
import { createApp } from './app';
import { Store } from './store';
const store = new Store(process.env.STATE_PATH ?? path.resolve(__dirname, '../data/state.json'));
const port = Number(process.env.PORT ?? 3001);
createApp(store).listen(port, () => console.log(`API on http://localhost:${port}`));

import 'primeicons/primeicons.css';
import './assets/main.css';
import { createApp } from 'vue';
import App from './App.vue';
import { defaultDependencies, installPlugins } from './plugins';
import { createAppRouter } from './router';

const app = createApp(App);

installPlugins(app, defaultDependencies());
app.use(createAppRouter());
// ERR-05: last-resort handler, so an unexpected error is logged instead of blanking the page.
app.config.errorHandler = (error, _instance, info) => {
  console.error(`Unhandled error (${info}):`, error);
};
app.mount('#app');

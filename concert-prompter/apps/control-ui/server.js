import { createStaticUiServer } from '../../config/static-ui-server.js';

createStaticUiServer({
  importMetaUrl: import.meta.url,
  serviceName: 'control-ui',
  defaultPort: 3000,
  clientConfigDefaults: {
    lyricsServiceUrl: 'http://localhost:4000',
    audienceUrl: 'http://localhost:3001/',
    singerUrl: 'http://localhost:3002/'
  }
}).listen();

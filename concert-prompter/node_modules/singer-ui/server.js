import { createStaticUiServer } from '../../config/static-ui-server.js';

createStaticUiServer({
  importMetaUrl: import.meta.url,
  serviceName: 'singer-ui',
  defaultPort: 3002,
  clientConfigDefaults: {
    lyricsServiceUrl: 'http://localhost:4000',
    audienceUrl: 'http://localhost:4000/audience/',
    singerUrl: 'http://localhost:4000/singer/'
  }
}).listen();

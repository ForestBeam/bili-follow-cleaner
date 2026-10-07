import { isBridgeMessage } from '../bridge/protocol';
import { createApiResponder } from './responder';

const respond = createApiResponder();
let activeToken: string | null = null;

window.addEventListener('message', (event) => {
  if (event.source !== window || !isBridgeMessage(event.data)) {
    return;
  }
  const message = event.data;
  if (message.type === 'hello') {
    activeToken = message.token;
    return;
  }
  if (message.type !== 'api-request' || activeToken === null || message.token !== activeToken) {
    return;
  }
  void respond(message).then((response) => {
    window.postMessage(response, '*');
  });
});

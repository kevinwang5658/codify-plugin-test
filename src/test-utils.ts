import Ajv from 'ajv';
import { IpcMessageSchema, IpcMessageV2, MessageStatus } from 'codify-schemas';
import { ChildProcess } from 'node:child_process';

const ajv = new Ajv.default({
  strict: true
});
const ipcMessageValidator = ajv.compile(IpcMessageSchema);

export const CodifyTestUtils = {
  sendMessageAndAwaitResponse(process: ChildProcess, message: IpcMessageV2): Promise<any> {
    return new Promise((resolve, reject) => {
      process.on('message', (response: IpcMessageV2) => {
        if (!ipcMessageValidator(response)) {
          throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
        }

        // Wait for the message response. Other messages such as sudoRequest may be sent before the response returns
        if (response.requestId === message.requestId) {
          if (response.status === MessageStatus.SUCCESS) {
            resolve(response.data)
          } else {
            reject(new Error(String(response.data)))
          }
        }
      });

      // Send message last to ensure listeners are all registered
      process.send(message);
    });
  },

};

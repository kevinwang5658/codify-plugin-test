import { EventEmitter } from 'node:events';
import { ChildProcess } from 'node:child_process';
import { Readable } from 'stream';
import { CodifyTestUtils } from './test-utils.js';
import { describe, expect, it, vi } from 'vitest';
import { MessageStatus } from 'codify-schemas';

describe('Test Utils tests', async () => {

  const mockChildProcess = () => {
    const process = new ChildProcess();
    process.stdout = new EventEmitter() as Readable;
    process.stderr = new EventEmitter() as Readable
    process.send = () => true;

    return process;
  }

  it('Sends the message that was passed in', async () => {
    const process = mockChildProcess();
    const sendMock = vi.spyOn(process, 'send');

    CodifyTestUtils.sendMessageAndAwaitResponse(process, { cmd: 'message', data: 'data' })

    expect(sendMock.mock.calls.length).to.eq(1);
    expect(sendMock.mock.calls[0][0]).to.deep.eq({ cmd: 'message', data: 'data' });
  })

  it('Send a message and receives a response from a plugin (success)', async () => {
    const process = mockChildProcess();

    const result = await Promise.all([
      (async () => {
        await sleep(30);
        // Note that the response must end in _Response. In accordance to the message schema rules.
        process.emit('message', { cmd: 'message_Response', status: MessageStatus.SUCCESS, data: 'data' })
      })(),
      CodifyTestUtils.sendMessageAndAwaitResponse(process, { cmd: 'message', data: 'data' }),
    ]);

    expect(result[1]).to.eq('data')
  });

  it('Send a message and can handle errors', async () => {
    const process = mockChildProcess();

    expect(async () => Promise.all([
      (async () => {
        await sleep(30);
        // Note that the response must end in _Response. In accordance to the message schema rules.
        process.emit('message', { cmd: 'message_Response', status: MessageStatus.ERROR, data: 'error message' })
      })(),
      CodifyTestUtils.sendMessageAndAwaitResponse(process, { cmd: 'message', data: 'data' }),
    ])).rejects.toThrowError(new Error('error message'))
  });

  it('Ignores other IPC messages', async () => {
    const process = mockChildProcess();

    const result = await Promise.all([
      (async () => {
        await sleep(30);
        process.emit('message', { cmd: 'randomMessage1', status: MessageStatus.SUCCESS, data: 'message1' })
        process.emit('message', { cmd: 'randomMessage2', status: MessageStatus.SUCCESS, data: 'message2' })


        process.emit('message', { cmd: 'message_Response', status: MessageStatus.SUCCESS, data: 'data' })
      })(),
      CodifyTestUtils.sendMessageAndAwaitResponse(process, { cmd: 'message', data: 'data' }),
    ]);

    // Only the final _Response message should be returned.
    expect(result[1]).to.eq('data')
  });
});

async function sleep(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

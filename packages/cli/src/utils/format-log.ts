import { Transform } from 'node:stream';

const getTimestamp = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });

  return `[${formatter.format(now).replaceAll('/', '-').replaceAll('.', ':').replaceAll(',', '').replace('GMT+', '+')}] `;
};

export const createTimestampTransformer = () => {
  let leftover: string | undefined = undefined;

  return new Transform({
    transform(chunk, encoding, callback) {
      const lines: string[] = (leftover + chunk.toString()).split('\n');

      leftover = lines.pop();

      const formattedChunk = lines
        .map((line) => (line ? `${getTimestamp()}${line}` : ''))
        .join('\n');

      callback(null, formattedChunk + (lines.length > 0 ? '\n' : ''));
    },
    flush(callback) {
      if (leftover) {
        this.push(`${getTimestamp()}${leftover}\n`);
      }
      callback();
    },
  });
};

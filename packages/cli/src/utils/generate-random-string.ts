export function generateRandomStrings(totalCharacters: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  let result = '';

  for (let i = 0; i < totalCharacters; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

import fs from 'node:fs/promises';
import path from 'node:path';

let cachedInlineAttachments = null;

export async function getEventEmailInlineAttachments() {
  if (cachedInlineAttachments) {
    return cachedInlineAttachments;
  }

  const imageDirectory = path.join(process.cwd(), 'public', 'img', 'email');
  const [logo, footer] = await Promise.all([
    fs.readFile(path.join(imageDirectory, 'event-logo.png')),
    fs.readFile(path.join(imageDirectory, 'event-footer.jpeg')),
  ]);

  cachedInlineAttachments = [
    {
      filename: 'event-logo.png',
      content: logo,
      contentId: 'mash-logo',
    },
    {
      filename: 'event-footer.jpeg',
      content: footer,
      contentId: 'mash-delhi-footer',
    },
  ];

  return cachedInlineAttachments;
}

export const getQrPassEmailInlineAttachments = getEventEmailInlineAttachments;

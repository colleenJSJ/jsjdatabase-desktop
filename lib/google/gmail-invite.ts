import { google } from 'googleapis';
import { googleAuth } from '@/lib/google/auth';

function toBase64Url(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeSubject(subject: string): string {
  // Encode non-ASCII using RFC 2047 encoded-word
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

export async function sendIcsInvite(params: {
  userId: string; // organizer user id in our system
  fromEmail: string;
  fromName?: string;
  to: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  icsContent: string;
  method: 'REQUEST' | 'CANCEL';
  label?: string; // optional Gmail label to apply
}) {
  const { userId, fromEmail, fromName, to, subject, textBody, htmlBody, icsContent, method } = params;

  if (!to || to.length === 0) return { skipped: true };

  const auth = await googleAuth.getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const mixedBoundary = 'mix-' + Math.random().toString(16).slice(2);
  const altBoundary = 'alt-' + Math.random().toString(16).slice(2);
  const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const toHeader = to.join(', ');
  const plain = textBody || 'You have been invited to an event.';
  const html = htmlBody || `<p>${plain.replace(/\n/g, '<br/>')}</p>`;

  // multipart/mixed
  //  ├─ multipart/alternative (text/plain + text/html)
  //  └─ text/calendar; method=REQUEST; component=VEVENT (attachment)
  const mime = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plain,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${altBoundary}`,
    `Content-Type: text/calendar; method=${method}; component=VEVENT; charset="UTF-8"; name="invite.ics"`,
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: inline; filename="invite.ics"',
    'Content-Class: urn:content-classes:calendarmessage',
    '',
    Buffer.from(icsContent, 'utf8').toString('base64'),
    '',
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: text/calendar; method=${method}; component=VEVENT; charset="UTF-8"; name="invite.ics"`,
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="invite.ics"',
    'Content-Class: urn:content-classes:calendarmessage',
    '',
    Buffer.from(icsContent, 'utf8').toString('base64'),
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');

  const raw = toBase64Url(mime);
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return { id: res.data.id };
}

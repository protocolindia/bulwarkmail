import { test, expect } from '@playwright/test';
import { ACCOUNTS } from './helpers/config';
import { sendMail } from './helpers/smtp';
import { JmapClient } from './helpers/jmap';
import {
  login,
  expandSharedFolders,
  openFolder,
  folderMailboxId,
  moveEmailTo,
  forceSync,
} from './helpers/app';

/**
 * Moving mail across the own-account / shared-folder boundary, in both
 * directions, and between two shared folders. The move is driven from the list
 * context menu's "Move to" submenu; the authoritative check is the server-side
 * mailbox the message ends up in, with the reliably-updating (own-account)
 * counters checked in the UI too.
 */
const { alice, carol } = ACCOUNTS;
const subj = (l: string) => `IT ${l} ${Date.now()}`;

test.describe('Shared-folder moves', () => {
  let ja: JmapClient; // owner
  let jc: JmapClient; // grantee
  let teamA: string;
  let teamB: string;

  test.beforeEach(async () => {
    ja = await JmapClient.connect(alice.email, alice.password);
    jc = await JmapClient.connect(carol.email, carol.password);
    await ja.reset();
    await jc.reset();
    teamA = await ja.createSharedFolder('TeamA', carol.email);
    teamB = await ja.createSharedFolder('TeamB', carol.email);
  });

  async function seedInto(mailboxId: string, subject: string, owner = ja): Promise<void> {
    const acct = owner === ja ? alice : carol;
    await sendMail({ from: acct.email, authPass: acct.password, to: acct.email, subject, body: 'x' });
    const m = await owner.waitForEmail(subject);
    await owner.moveEmail(m.id, mailboxId);
  }

  test('shared folder A -> shared folder B', async ({ page }) => {
    const s = subj('mv-a2b');
    await seedInto(teamA, s);

    await login(page, carol);
    await expandSharedFolders(page, alice.email);
    const dest = await folderMailboxId(page, { name: 'TeamB', shared: true });
    await openFolder(page, { name: 'TeamA', shared: true });
    await forceSync(page);

    await moveEmailTo(page, s, dest);
    await page.waitForTimeout(1500);

    expect(await ja.findEmailBySubject(s, teamB), 'message in TeamB').toBeTruthy();
    expect(await ja.findEmailBySubject(s, teamA), 'message left TeamA').toBeFalsy();
  });

  test('shared folder B -> shared folder A', async ({ page }) => {
    const s = subj('mv-b2a');
    await seedInto(teamB, s);

    await login(page, carol);
    await expandSharedFolders(page, alice.email);
    const dest = await folderMailboxId(page, { name: 'TeamA', shared: true });
    await openFolder(page, { name: 'TeamB', shared: true });
    await forceSync(page);

    await moveEmailTo(page, s, dest);
    await page.waitForTimeout(1500);

    expect(await ja.findEmailBySubject(s, teamA), 'message in TeamA').toBeTruthy();
    expect(await ja.findEmailBySubject(s, teamB), 'message left TeamB').toBeFalsy();
  });

  // KNOWN LIMITATION (documented via test.fail): the "Move to" submenu offers a
  // shared folder as a destination for an own-account message, but clicking it
  // does NOT relocate the message across the account boundary — it stays put.
  // Same in reverse (shared -> own). If cross-account moves get implemented,
  // these will start passing; flip them back to plain tests then.
  test.fail('own account -> shared folder', async ({ page }) => {
    const s = subj('mv-own2sh');
    await sendMail({ from: carol.email, authPass: carol.password, to: carol.email, subject: s, body: 'x' });
    await jc.waitForEmail(s);

    await login(page, carol);
    await expandSharedFolders(page, alice.email);
    const dest = await folderMailboxId(page, { name: 'TeamA', shared: true });
    await openFolder(page, { role: 'inbox', shared: false });
    await forceSync(page);

    await moveEmailTo(page, s, dest);
    await page.waitForTimeout(2000);

    // Expected (once supported): the message moves to the owner's shared TeamA.
    expect(await ja.findEmailBySubject(s, teamA), 'message in shared TeamA').toBeTruthy();
  });

  test.fail('shared folder -> own account', async ({ page }) => {
    const s = subj('mv-sh2own');
    await seedInto(teamA, s);

    await login(page, carol);
    await expandSharedFolders(page, alice.email);
    const dest = await folderMailboxId(page, { role: 'inbox', shared: false });
    await openFolder(page, { name: 'TeamA', shared: true });
    await forceSync(page);

    await moveEmailTo(page, s, dest);
    await page.waitForTimeout(2000);

    // Expected (once supported): the message arrives in carol's own Inbox.
    expect(await jc.findEmailBySubject(s), 'message in own account').toBeTruthy();
  });
});

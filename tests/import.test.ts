import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const exec = promisify(execFile);
test('CSV import generates private codes, skips normalized duplicates and reports invalid rows', async () => {
  await mkdir('work', { recursive: true });
  const prefix = `work/import-${randomUUID()}`;
  const input = `${prefix}.csv`,
    output = `${prefix}.private.csv`,
    db = `${prefix}.sqlite`;
  await writeFile(
    input,
    'phone,name\n0612345678,Student\n+212612345678,Duplicate\nnot-a-number,Invalid\n0712345678,Other\n',
  );
  const env = {
    ...process.env,
    DEMO_MODE: 'false',
    ADMIN_KEY: 'test-admin-long-credential-1234567890',
    PHONE_HASH_SECRET: 'different-test-phone-secret-123456789',
    DATABASE_PATH: db,
  };
  try {
    let result: { stdout: string; stderr: string } | undefined;
    try {
      await exec(process.execPath, ['--import', 'tsx', 'scripts/import-class.ts', input, output], {
        env,
      });
      assert.fail('Invalid rows should return exit code 2');
    } catch (e) {
      const err = e as Error & { code: number; stdout: string; stderr: string };
      assert.equal(err.code, 2);
      result = err;
    }
    assert.match(result!.stdout, /Imported 2; duplicate rows 1; invalid rows 1/);
    assert.ok(!result!.stdout.includes('0612345678'));
    assert.ok(!result!.stderr.includes('not-a-number'));
    const codes = await readFile(output, 'utf8');
    assert.match(codes, /\+212612345678/);
    assert.match(codes, /\+212712345678/);
    const connection = new DatabaseSync(db);
    const count = connection.prepare('SELECT COUNT(*) AS n FROM authorized_participants').get() as {
      n: number;
    };
    assert.equal(count.n, 2);
    connection.close();
    await assert.rejects(
      () =>
        exec(process.execPath, ['--import', 'tsx', 'scripts/import-class.ts', input, output], {
          env,
        }),
      /EEXIST/,
    );
  } finally {
    for (const file of [input, output, db, db + '-wal', db + '-shm'])
      await rm(file, { force: true });
  }
});

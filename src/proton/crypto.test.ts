import { describe, expect, test } from 'bun:test';
import { VERIFICATION_STATUS } from '@protontech/crypto';
import { createOpenPGPCrypto, createProtonAccount, initCrypto, openpgp } from '../auth.js';

describe('official Proton crypto integration', () => {
  test.each([false, true])(
    'round-trips Drive content and checks signature contexts (AEAD=%s)',
    async (enableAead) => {
      await initCrypto();
      await initCrypto();
      const crypto = createOpenPGPCrypto();
      const { privateKey, armoredKey } = await crypto.generateKey('test-passphrase', {
        enableAead,
      });
      const restored = await crypto.decryptKey(armoredKey, 'test-passphrase');
      const data = new TextEncoder().encode('SDK upgrade round trip');
      const sessionKey = await crypto.generateSessionKey([privateKey], {
        enableAeadWithEncryptionKeys: enableAead,
      });
      const encrypted = await crypto.encryptAndSignDetached(
        data,
        sessionKey,
        [privateKey],
        privateKey,
        { enableAeadWithEncryptionKeys: enableAead }
      );
      const decrypted = await crypto.decryptAndVerifyDetached(
        encrypted.encryptedData,
        encrypted.signature,
        sessionKey,
        [restored]
      );
      expect(decrypted.data).toEqual(data);
      expect(decrypted.verified).toBe(VERIFICATION_STATUS.SIGNED_AND_VALID);
      const { signature } = await crypto.sign(data, privateKey, 'drive.test');
      expect((await crypto.verify(data, signature, [restored], 'drive.test')).verified).toBe(
        VERIFICATION_STATUS.SIGNED_AND_VALID
      );
      expect((await crypto.verify(data, signature, [restored], 'wrong.context')).verified).toBe(
        VERIFICATION_STATUS.SIGNED_AND_INVALID
      );
    }
  );

  test('imports existing OpenPGP address keys and returns all active addresses', async () => {
    const { privateKey } = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ email: 'one@example.com' }],
      passphrase: 'legacy-password',
      format: 'armored',
    });
    const account = createProtonAccount(
      {
        UID: 'uid',
        AccessToken: 'token',
        RefreshToken: 'refresh',
        addresses: [
          {
            ID: 'one',
            Email: 'one@example.com',
            Type: 1,
            Status: 1,
            keys: [
              { ID: 'key-one', Primary: 1, armoredKey: privateKey, passphrase: 'legacy-password' },
            ],
          },
          {
            ID: 'two',
            Email: 'two@example.com',
            Type: 1,
            Status: 1,
            keys: [
              { ID: 'key-two', Primary: 1, armoredKey: privateKey, passphrase: 'legacy-password' },
            ],
          },
          { ID: 'disabled', Email: 'disabled@example.com', Type: 1, Status: 0, keys: [] },
        ],
      },
      createOpenPGPCrypto()
    );
    const addresses = await account.getOwnAddresses();
    expect(addresses.map((address) => address.addressId)).toEqual(['one', 'two']);
    expect(addresses[0].keys[0].key.isPrivate()).toBe(true);
    expect((await account.getOwnPrimaryAddress()).keys[0].key).toBe(addresses[0].keys[0].key);
  });
});

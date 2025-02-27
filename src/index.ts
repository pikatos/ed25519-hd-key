import * as createHmac from 'create-hmac'
import * as nacl from 'tweetnacl'

import { replaceDerive, pathRegex } from './utils';

interface Nacl {
    crypto_sign_seed_keypair: (
        val: Buffer,
    ) => { signPk: Buffer; signSk: Buffer };
}
type Hex = string;
type Path = string;

type Keys = {
    key: Buffer;
    chainCode: Buffer;
};

const ED25519_CURVE = 'ed25519 seed';
const HARDENED_OFFSET = 0x80000000;

export const getMasterKeyFromSeed = (seed: Hex): Keys => {
    const hmac = createHmac('sha512', ED25519_CURVE);
    const I = hmac.update(Buffer.from(seed, 'hex')).digest();
    const IL = I.slice(0, 32);
    const IR = I.slice(32);
    return {
        key: IL,
        chainCode: IR,
    };
};

const CKDPriv = ({ key, chainCode }: Keys, index: number): Keys => {
    const indexBuffer = Buffer.allocUnsafe(4);
    indexBuffer.writeUInt32BE(index, 0);

    const data = Buffer.concat([Buffer.alloc(1, 0), key, indexBuffer]);

    const I = createHmac('sha512', chainCode)
        .update(data)
        .digest();
    const IL = I.slice(0, 32);
    const IR = I.slice(32);
    return {
        key: IL,
        chainCode: IR,
    };
};

export const getPublicKey = (privateKey: Buffer, withZeroByte = true): Buffer => {
    const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
    const signPk = keyPair.secretKey.subarray(32);
    const zero = Buffer.alloc(1, 0);
    return withZeroByte ?
        Buffer.concat([zero, Buffer.from(signPk)]) :
        Buffer.from(signPk);
};

export const isValidPath = (path: string): boolean => {
    if (!pathRegex.test(path)) {
        return false;
    }
    return !path
        .split('/')
        .slice(1)
        .map(replaceDerive)
        .some(isNaN as any /* ts T_T*/);
};

export const deriveFromKey = (path: Path, masterKey: Keys): Keys => {
    if (!isValidPath(path)) {
        throw new Error('Invalid derivation path');
    }
    
    const { key, chainCode } = masterKey;
    const segments = path
        .split('/')
        .slice(1)
        .map(replaceDerive)
        .map(el => parseInt(el, 10));

    return segments.reduce(
        (parentKeys, segment) => CKDPriv(parentKeys, segment + HARDENED_OFFSET),
        { key, chainCode },
    );
};

export const deriveFromSeed = (path: Path, seed: Hex): Keys => {
    return deriveFromKey(path, getMasterKeyFromSeed(seed));
};

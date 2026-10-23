import { Keypair, xdr, TransactionBuilder } from "@stellar/stellar-sdk";
import { makeThing } from "unrelated-lib";
// `.toXDR()` and `toString('hex')` in comments are not code.
const string = "TransactionBuilder.fromXDR()";
const native = Buffer.from("abc");
native.toString("hex");
makeThing().toXDR();
const unrelated = { toXDR() { return true; } };
unrelated.toXDR();
const signer = Keypair.fromSecret("S...");
const sig = signer.sign(new Uint8Array());
xdr.encodeBytes(sig, "hex");
const scv = xdr.ScVal.scvU32(42);
scv.toXdr("hex");
function unrelatedBytes(input: any) { return input.toString("hex"); }
